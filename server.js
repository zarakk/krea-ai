require("dotenv").config();
const WebSocket = require("ws");
const http = require("http");
const fetch = require("node-fetch");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const HUGGING_FACE_API_URL =
  "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev";

async function generateImage(sliderValue) {
  const prompt = `A forest full of trees`;
  try {
    console.log(`Sending request to Hugging Face API with prompt: "${prompt}"`);

    const response = await fetch(HUGGING_FACE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HUGGING_FACE_TOKEN}`,
      },
      body: JSON.stringify({
        inputs: prompt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `API response not OK. Status: ${response.status}, Response: ${errorText}`
      );
      throw new Error(
        `HTTP error! status: ${response.status}, message: ${errorText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString("base64");
    console.log("Image generated successfully");
    return `data:image/png;base64,${base64Image}`;
  } catch (error) {
    console.error("Error generating image:", error.message);
    throw error;
  }
}

wss.on("connection", function connection(ws) {
  console.log("Client connected");

  ws.on("message", async function incoming(message) {
    let data;
    try {
      data = JSON.parse(message);
    } catch (error) {
      console.error("Error parsing message:", error);
      return;
    }

    if (data.type === "generateImage") {
      console.log("Received generateImage request", data.sliderValue);

      try {
        const result = await generateImage(data.sliderValue);
        ws.send(
          JSON.stringify({
            type: "generatedImage",
            imageData: result,
          })
        );
      } catch (error) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Failed to generate image. Please try again later.",
          })
        );
      }
    }
  });

  ws.on("close", function () {
    console.log("Client disconnected");
  });
});

const PORT = 3000;
server.listen(PORT, function () {
  console.log(`Server is listening on port ${PORT}`);
});

// require("dotenv").config();
// const WebSocket = require("ws");
// const http = require("http");
// const { spawn, exec } = require("child_process");

// const fs = require("fs");
// const tmp = require("tmp");
// const path = require("path");
// const util = require("util");
// const execPromise = util.promisify(exec);
// const tmpFilePromise = util.promisify(tmp.file);

// const server = http.createServer();
// const wss = new WebSocket.Server({ server });

// function createTempFile(prefix, postfix) {
//   const tempDir = path.join(__dirname, "temp");
//   if (!fs.existsSync(tempDir)) {
//     fs.mkdirSync(tempDir);
//   }
//   const tempPath = path.join(tempDir, `${prefix}-${Date.now()}${postfix}`);
//   console.log(`Created temp file: ${tempPath}`);
//   return tempPath;
// }

// async function editImage(inputImageBase64, instruction) {
//   let tempInputPath, tempOutputPath;

//   try {
//     tempInputPath = createTempFile("input", ".txt");
//     tempOutputPath = createTempFile("output", ".txt");

//     console.log("Temp input path:", tempInputPath);
//     console.log("Temp output path:", tempOutputPath);

//     // Write input image data to temp file
//     fs.writeFileSync(tempInputPath, inputImageBase64, "utf8");
//     console.log(`Written ${inputImageBase64.length} characters to input file`);

//     console.log("Starting Python script execution");

//     const pythonScript = path.join(__dirname, "run_pix2pix.py");
//     const pythonProcess = spawn("python", [
//       pythonScript,
//       tempInputPath,
//       tempOutputPath,
//       instruction,
//     ]);

//     return new Promise((resolve, reject) => {
//       let stdoutData = "";
//       let stderrData = "";

//       pythonProcess.stdout.on("data", (data) => {
//         stdoutData += data.toString();
//         console.log(`Python stdout: ${data}`);
//       });

//       pythonProcess.stderr.on("data", (data) => {
//         stderrData += data.toString();
//         console.error(`Python stderr: ${data}`);
//       });

//       pythonProcess.on("close", (code) => {
//         console.log(`Python process exited with code ${code}`);

//         if (code !== 0) {
//           reject(
//             new Error(
//               `Python script exited with code ${code}. Error: ${stderrData}`
//             )
//           );
//           return;
//         }

//         if (!fs.existsSync(tempOutputPath)) {
//           reject(new Error(`Output file not found: ${tempOutputPath}`));
//           return;
//         }

//         const result = fs.readFileSync(tempOutputPath, "utf8");
//         console.log(`Read ${result.length} characters from output file`);

//         // Clean up temporary files
//         if (fs.existsSync(tempInputPath)) {
//           fs.unlinkSync(tempInputPath);
//           console.log(`Deleted temp input file: ${tempInputPath}`);
//         }
//         if (fs.existsSync(tempOutputPath)) {
//           fs.unlinkSync(tempOutputPath);
//           console.log(`Deleted temp output file: ${tempOutputPath}`);
//         }

//         resolve(result.trim());
//       });
//     });
//   } catch (error) {
//     console.error("Error in editImage:", error);
//     throw error;
//   }
// }

// wss.on("connection", function connection(ws) {
//   console.log("Client connected");

//   ws.on("message", async function incoming(message) {
//     let data;
//     try {
//       data = JSON.parse(message);
//       console.log("Received message type:", data.type);
//     } catch (error) {
//       console.error("Error parsing message:", error);
//       return;
//     }

//     if (data.type === "editImage") {
//       console.log(
//         "Received editImage request. Slider value:",
//         data.sliderValue
//       );

//       try {
//         const instruction = `Edit the image to be ${data.sliderValue}% more futuristic`;
//         console.log("Instruction:", instruction);

//         if (!data.inputImageBase64) {
//           throw new Error("No input image provided");
//         }

//         console.log("Input image base64 length:", data.inputImageBase64.length);
//         console.log("Calling editImage function...");
//         const result = await editImage(data.inputImageBase64, instruction);
//         console.log("Image edited successfully. Result length:", result.length);

//         ws.send(
//           JSON.stringify({
//             type: "editedImage",
//             imageData: `data:image/png;base64,${result}`,
//           })
//         );
//       } catch (error) {
//         console.error("Error in editImage process:", error);
//         ws.send(
//           JSON.stringify({
//             type: "error",
//             message: `Failed to edit image: ${error.message}`,
//           })
//         );
//       }
//     }
//   });

//   ws.on("close", function () {
//     console.log("Client disconnected");
//   });
// });

// const PORT = 3000;
// server.listen(PORT, function () {
//   console.log(`Server is listening on port ${PORT}`);
// });
