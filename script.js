const canvas = document.getElementById("canvas");
const addCircleBtn = document.getElementById("addCircle");
const addSquareBtn = document.getElementById("addSquare");
const addImageBtn = document.getElementById("addImage");
const debugInfo = document.getElementById("debugInfo");

let device, context, pipeline, vertexBuffer, uniformBuffer, bindGroup;
let shapes = [];
let selectedShape = null;
let isDragging = false;
let offset = { x: 0, y: 0 };

const shaderCode = `
  struct Uniforms {
      u_resolution: vec2<f32>,
  };

  struct VertexOutput {
      @builtin(position) position: vec4<f32>,
      @location(0) color: vec4<f32>,
      @location(1) texCoord: vec2<f32>,
  };

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;
  @group(0) @binding(1) var t_diffuse: texture_2d<f32>;
  @group(0) @binding(2) var s_diffuse: sampler;

  @vertex
  fn vertexMain(@location(0) position: vec2<f32>,
                @location(1) color: vec4<f32>,
                @location(2) texCoord: vec2<f32>) -> VertexOutput {
      var output: VertexOutput;
      output.position = vec4<f32>(
          position.x / uniforms.u_resolution.x * 2.0 - 1.0,
          1.0 - position.y / uniforms.u_resolution.y * 2.0,
          0.0,
          1.0
      );
      output.color = color;
      output.texCoord = texCoord;
      return output;
  }

  @fragment
  fn fragmentMain(@location(0) color: vec4<f32>,
                  @location(1) texCoord: vec2<f32>) -> @location(0) vec4<f32> {
      let texColor = textureSample(t_diffuse, s_diffuse, texCoord);
      return mix(texColor, color, color.a);
  }
`;

async function initWebGPU() {
  if (!navigator.gpu) {
    console.error("WebGPU not supported on this browser.");
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    console.error("No appropriate GPUAdapter found.");
    return;
  }

  device = await adapter.requestDevice();

  context = canvas.getContext("webgpu");
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: canvasFormat,
  });

  const shaderModule = device.createShaderModule({
    code: shaderCode,
  });

  pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: "vertexMain",
      buffers: [
        {
          arrayStride: 32,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" },
            { shaderLocation: 1, offset: 8, format: "float32x4" },
            { shaderLocation: 2, offset: 24, format: "float32x2" },
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fragmentMain",
      targets: [
        {
          format: canvasFormat,
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  uniformBuffer = device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const placeholderTexture = device.createTexture({
    size: [1, 1],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      {
        binding: 1,
        resource: placeholderTexture.createView(),
      },
      {
        binding: 2,
        resource: sampler,
      },
    ],
  });

  device.queue.writeBuffer(
    uniformBuffer,
    0,
    new Float32Array([canvas.width, canvas.height])
  );
}

function createShape(type, x, y) {
  return {
    id: Date.now(),
    type,
    x,
    y,
    size: 40,
    scale: 1,
    color: type === "circle" ? [1, 0, 0, 1] : [0, 0, 1, 1],
    isSelected: false,
    zIndex: 1,
  };
}

function createImage(x, y, width, height, texture) {
  return {
    id: Date.now(),
    type: "image",
    x,
    y,
    width,
    height,
    texture,
    isSelected: false,
    zIndex: 0,
  };
}

function updateVertexBuffer() {
  const vertices = shapes.flatMap((shape) => {
    const { x, y, size, scale, color, isSelected } = shape;
    const scaledSize = size * scale;
    const shapeColor = isSelected ? [1, 1, 1, 1] : color;

    if (shape.type === "circle") {
      const segments = 32;
      const angleStep = (2 * Math.PI) / segments;
      return Array.from({ length: segments }, (_, i) => {
        const angle1 = i * angleStep;
        const angle2 = (i + 1) * angleStep;
        return [
          x,
          y,
          ...shapeColor,
          0,
          0,
          x + (Math.cos(angle1) * scaledSize) / 2,
          y + (Math.sin(angle1) * scaledSize) / 2,
          ...shapeColor,
          0,
          0,
          x + (Math.cos(angle2) * scaledSize) / 2,
          y + (Math.sin(angle2) * scaledSize) / 2,
          ...shapeColor,
          0,
          0,
        ];
      }).flat();
    } else if (shape.type === "square") {
      return [
        x - scaledSize / 2,
        y - scaledSize / 2,
        ...shapeColor,
        0,
        0,
        x + scaledSize / 2,
        y - scaledSize / 2,
        ...shapeColor,
        0,
        0,
        x - scaledSize / 2,
        y + scaledSize / 2,
        ...shapeColor,
        0,
        0,
        x + scaledSize / 2,
        y - scaledSize / 2,
        ...shapeColor,
        0,
        0,
        x + scaledSize / 2,
        y + scaledSize / 2,
        ...shapeColor,
        0,
        0,
        x - scaledSize / 2,
        y + scaledSize / 2,
        ...shapeColor,
        0,
        0,
      ];
    } else if (shape.type === "image") {
      const { width, height } = shape;
      return [
        x,
        y,
        0,
        0,
        0,
        0,
        0,
        0,
        x + width,
        y,
        0,
        0,
        0,
        0,
        1,
        0,
        x,
        y + height,
        0,
        0,
        0,
        0,
        0,
        1,
        x + width,
        y,
        0,
        0,
        0,
        0,
        1,
        0,
        x + width,
        y + height,
        0,
        0,
        0,
        0,
        1,
        1,
        x,
        y + height,
        0,
        0,
        0,
        0,
        0,
        1,
      ];
    }
  });

  vertexBuffer = device.createBuffer({
    size: vertices.length * 4,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(vertexBuffer, 0, new Float32Array(vertices));
}

function render() {
  const commandEncoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();

  const renderPass = commandEncoder.beginRenderPass({
    colorAttachments: [
      {
        view: textureView,
        clearValue: { r: 0.1, g: 0.2, b: 0.3, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });

  renderPass.setPipeline(pipeline);
  renderPass.setBindGroup(0, bindGroup);
  renderPass.setVertexBuffer(0, vertexBuffer);

  let vertexCount = 0;
  shapes.forEach((shape) => {
    if (shape.type === "image") {
      renderPass.setBindGroup(0, shape.bindGroup);
      renderPass.draw(6, 1, vertexCount);
      vertexCount += 6;
    } else {
      const shapeVertexCount = shape.type === "circle" ? 32 * 3 : 6;
      renderPass.draw(shapeVertexCount, 1, vertexCount);
      vertexCount += shapeVertexCount;
    }
  });

  renderPass.end();
  device.queue.submit([commandEncoder.finish()]);
}

// function updateDebugInfo(x, y, shapeX, shapeY) {
//   debugInfo.textContent = `Mouse: (${x.toFixed(2)}, ${y.toFixed(
//     2
//   )}) Shape: (${shapeX.toFixed(2)}, ${shapeY.toFixed(2)})`;
// }

function handleMouseDown(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Reverse the array to check from top to bottom (last drawn to first)
  const clickedShape = [...shapes].reverse().find((shape) => {
    if (shape.type === "image") {
      return (
        x >= shape.x &&
        x <= shape.x + shape.width &&
        y >= shape.y &&
        y <= shape.y + shape.height
      );
    } else {
      const dx = x - shape.x;
      const dy = y - shape.y;
      return Math.sqrt(dx * dx + dy * dy) <= (shape.size * shape.scale) / 2;
    }
  });

  if (clickedShape === selectedShape) {
    // If the clicked shape is already selected, unselect it
    selectedShape.isSelected = false;
    selectedShape = null;
  } else {
    // Unselect the previously selected shape
    if (selectedShape) {
      selectedShape.isSelected = false;
    }

    // Select the new shape
    selectedShape = clickedShape;
    if (selectedShape) {
      selectedShape.isSelected = true;
      isDragging = true;
      offset = { x: x - selectedShape.x, y: y - selectedShape.y };

      // Move the selected shape to the end of the array (top of the stack)
      shapes = shapes.filter((shape) => shape !== selectedShape);
      shapes.push(selectedShape);
    }
  }

  updateVertexBuffer();
  render();
}

function handleDoubleClick(e) {
  if (selectedShape) {
    selectedShape.isSelected = false;
    selectedShape = null;
    updateVertexBuffer();
    render();
  }
}

function handleMouseMove(e) {
  if (isDragging && selectedShape) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    selectedShape.x = x - offset.x;
    selectedShape.y = y - offset.y;

    updateVertexBuffer();
    render();
    // updateDebugInfo(x, y, selectedShape.x, selectedShape.y);
  }
}

function handleMouseUp() {
  isDragging = false;
}

function handleWheel(e) {
  if (selectedShape && selectedShape.type !== "image") {
    e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    selectedShape.scale *= scaleFactor;
    selectedShape.scale = Math.max(0.1, Math.min(selectedShape.scale, 5));
    updateVertexBuffer();
    render();
  }
}

addCircleBtn.addEventListener("click", () => {
  shapes.push(createShape("circle", 200, 150));
  updateVertexBuffer();
  render();
});

addSquareBtn.addEventListener("click", () => {
  shapes.push(createShape("square", 200, 150));
  updateVertexBuffer();
  render();
});

addImageBtn.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const imageBitmap = await createImageBitmap(file);
      await addImageToCanvas(imageBitmap);
    }
  };
  input.click();
});

async function addImageToCanvas(imageBitmap) {
  const texture = device.createTexture({
    size: [imageBitmap.width, imageBitmap.height],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture: texture },
    [imageBitmap.width, imageBitmap.height]
  );

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  const imageBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      {
        binding: 1,
        resource: texture.createView(),
      },
      {
        binding: 2,
        resource: sampler,
      },
    ],
  });

  const newImage = createImage(
    150,
    100,
    imageBitmap.width,
    imageBitmap.height,
    texture
  );
  newImage.bindGroup = imageBindGroup;
  shapes.push(newImage);
  updateVertexBuffer();
  render();
}
canvas.addEventListener("mousedown", handleMouseDown);
canvas.addEventListener("mousemove", handleMouseMove);
canvas.addEventListener("mouseup", handleMouseUp);
canvas.addEventListener("wheel", handleWheel);
canvas.addEventListener("dblclick", handleDoubleClick);

window.addEventListener("keydown", (e) => {
  if (e.key === "Backspace" && selectedShape) {
    shapes = shapes.filter((shape) => shape !== selectedShape);
    selectedShape = null;
    updateVertexBuffer();
    render();
  }
});

const generatedImageDiv = document.querySelector("#generatedImage");
// New WebSocket connection
const socket = new WebSocket("ws://localhost:3000");

socket.onmessage = function (event) {
  const data = JSON.parse(event.data);
  // loadingIndicator.style.display = "none";
  if (data.type === "transformedImage") {
    generatedImageDiv.innerHTML = `<img width="400" height="300" src="data:image/png;base64,${data.imageData}" alt="Transformed Image">`;
  } else if (data.type === "error") {
    generatedImageDiv.innerHTML = `<p>Error: ${data.message}</p>`;
  }
};

// Slider functionality
// const slider = document.getElementById("slider");
// const sliderValue = document.getElementById("sliderValue");

// slider.addEventListener("input", function () {
//   sliderValue.textContent = this.value;

// // Capture canvas image
// const imageDataUrl = canvas.toDataURL("image/png");

// // Send slider value and canvas image to backend
// socket.send(
//   JSON.stringify({
//     type: "generateImage",
//     sliderValue: this.value,
//     canvasImage: imageDataUrl,
//   })
// );
// });

const slider = document.getElementById("aiStrengthSlider");
const fill = slider.querySelector(".slider-fill");
const value = document.querySelector(".slider-value");

slider.addEventListener("click", function (e) {
  const rect = this.getBoundingClientRect();
  const x = e.clientX - rect.left;
  let percent = Math.round((x / rect.width) * 100);
  percent = Math.max(0, Math.min(100, percent));

  fill.style.width = percent + "%";
  value.textContent = percent + "%";

  // Send the slider value to the server
  socket.send(
    JSON.stringify({
      type: "generateImage",
      sliderValue: percent,
    })
  );

  // Display a loading message
  generatedImageDiv.innerHTML = `<div class="loading-container">
              <div class="loader">
                <div class="loading-bars">
                  <div class="bar"></div>
                  <div class="bar"></div>
                  <div class="bar"></div>
                  <div class="bar"></div>
                  <div class="bar"></div>
                </div>
              </div>
            </div>`;
});

// Handle the response from the server
socket.onmessage = function (event) {
  const data = JSON.parse(event.data);
  if (data.type === "generatedImage") {
    // Display the generated image
    generatedImageDiv.innerHTML = `<img src="${data.imageData}" alt="Generated Image">`;
  } else if (data.type === "error") {
    generatedImageDiv.innerHTML = `<p>Error: ${data.message}</p>`;
    console.error("Server error:", data.message);
  }
};

// document.addEventListener("DOMContentLoaded", function () {
//   const kreaDemoAIStrengthSlider =
//     document.getElementById("aiStrengthSlider");
//   const kreaDemoSliderFill =
//     kreaDemoAIStrengthSlider.querySelector(".slider-fill");
//   const kreaDemoSliderValue =
//     kreaDemoAIStrengthSlider.querySelector(".slider-value");

//   function updateSlider(percent) {
//     kreaDemoSliderFill.style.width = `${percent}%`;
//     kreaDemoSliderValue.textContent = `${percent}%`;
//     console.log(`Slider updated to ${percent}%`); // Debug log
//   }

//   function handleSliderInteraction(e) {
//     const rect = kreaDemoAIStrengthSlider.getBoundingClientRect();
//     const x = e.clientX - rect.left;
//     let percent = Math.round((x / rect.width) * 100);
//     percent = Math.max(0, Math.min(100, percent));

//     updateSlider(percent);
//   }

//   kreaDemoAIStrengthSlider.addEventListener("mousedown", (e) => {
//     handleSliderInteraction(e);
//     document.addEventListener("mousemove", handleSliderInteraction);
//     document.addEventListener("mouseup", () => {
//       document.removeEventListener("mousemove", handleSliderInteraction);
//     });
//   });

//   // Prevent closing the tooltip when interacting with the slider
//   kreaDemoAIStrengthSlider.addEventListener("mouseenter", (e) => {
//     e.stopPropagation();
//   });

//   // Initialize slider to 0%
//   updateSlider(0);

//   console.log("Slider initialization complete");
// });

// Scaling and dragging functionality for the main-content
const mainContent = document.querySelector(".container");
const mainContentInner = document.querySelector(".main-content");
const canvasAreas = document.querySelectorAll(".canvas-area");

let scale = 1;
let isDragging2 = false;
let startX,
  startY,
  translateX = 0,
  translateY = 0;

mainContent.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  scale *= delta;
  scale = Math.min(Math.max(0.5, scale), 5); // Limit scale between 0.5 and 5
  updateTransform();
});

mainContent.addEventListener("mousedown", (e) => {
  if (!isClickOnCanvas(e)) {
    isDragging2 = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    mainContent.style.cursor = "grabbing";
  }
});

document.addEventListener("mousemove", (e) => {
  if (!isDragging2) return;
  translateX = e.clientX - startX;
  translateY = e.clientY - startY;
  updateTransform();
});

document.addEventListener("mouseup", () => {
  isDragging2 = false;
  mainContent.style.cursor = "grab";
});

document.addEventListener("mouseleave", () => {
  isDragging2 = false;
  mainContent.style.cursor = "grab";
});

function updateTransform() {
  mainContentInner.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
}

function isClickOnCanvas(e) {
  return Array.from(canvasAreas).some((area) => area.contains(e.target));
}

// Set initial cursor style for main content (outside canvas)
mainContent.style.cursor = "grab";

// Set cursor style for canvas areas
canvasAreas.forEach((area) => {
  area.style.cursor = "default";
});

(async function () {
  await initWebGPU();
  updateVertexBuffer();
  render();
})();
