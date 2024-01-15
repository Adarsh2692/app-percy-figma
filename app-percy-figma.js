#!/usr/bin/env node

const fs = require("fs");
const util = require("util");
const request = require("request");
const yml = require("js-yaml");
const { exec } = require("child_process");
const downloadImage = require("./downloadImage");
const path = require("path");

const execAsync = util.promisify(exec);

const handleError = (error) => {
    console.error("Error:", error);
};

const createFolder = (folderPath) => {
    return new Promise((resolve, reject) => {
        fs.mkdir(folderPath, { recursive: true }, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
};

/** Getting the config file path, by default, it is appPercyFigma.yml unless provided with the --config flag **/
const configFileIndex = process.argv.indexOf("--config");
const configFileName =
    configFileIndex !== -1
        ? process.argv[configFileIndex + 1]
        : "appPercyFigma.yml";

const configPath = path.resolve(__dirname, "..", "..", configFileName);

// const configPath = path.resolve(__dirname, configFileName); - dev

console.log(configPath);

const AppPercyFigma = async () => {
    try {
        const configContent = fs.readFileSync(configPath, "utf8");
        const config = yml.load(configContent);

        const resourcesPath = path.join(__dirname, "resources");
        await createFolder(resourcesPath);

        const baseUrl = "https://api.figma.com/v1/images/";

        /** Checking for percy token in the config file **/
        const percyToken = config.percy_token;

        if (percyToken) {
            process.env.PERCY_TOKEN = percyToken;
        }

        /** Figma User Token, either from the config or environment variables **/
        const figmaToken = config.figma_token || process.env.FIGMA_TOKEN;
        if (!figmaToken) {
            throw new Error(
                "Figma User token not provided. Please provide your user token in the config file or as an environment variable."
            );
        }

        /** Figma File Token, either from the config or environment variables **/
        let figmaFileToken =
            config.figma_file_token || process.env.FIGMA_FILE_TOKEN;
        if (!figmaFileToken) {
            throw new Error(
                "Figma File token not provided. Please provide your file token in the config file or as an environment variable."
            );
        }

        let downloadPromises = [];

        for (const detail of config.snapshotDetails) {
            try {
                const folderPath = `${resourcesPath}/${detail.deviceName}`;
                await createFolder(folderPath);
                let device = { ...detail };
                delete device.names;
                delete device.ids;
                device = await JSON.stringify(device, null, 2);

                const devicePath = `${folderPath}/device.json`;
                fs.writeFileSync(devicePath, device);

                const idString = detail.ids.join(",");
                const url = `${baseUrl}${figmaFileToken}?ids=${idString}`;
                const options = {
                    url: url,
                    headers: {
                        "X-FIGMA-TOKEN": figmaToken,
                    },
                };

                const responseBody = await new Promise((resolve, reject) => {
                    request.get(options, (error, response, body) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(JSON.parse(body));
                        }
                    });
                });

                const images = Object.entries(responseBody.images);

                for (let i = 0; i < images.length; i++) {
                    const imagePath = `${folderPath}/${detail.names[i]}.png`;
                    const downloadPromise = downloadImage(
                        images[i][1],
                        imagePath
                    ).catch((err) => {
                        console.error(
                            `${err}: Error downloading ${path.basename(
                                imagePath
                            )}, Please check if the id is correct`
                        );
                    });
                    downloadPromises.push(downloadPromise);
                }
            } catch (error) {
                handleError(error);
            }
        }

        // Wait for all download promises to complete before proceeding
        await Promise.all(downloadPromises);

        /** Uploading all the downloaded images to Percy with the name being the image file names**/
        const command = `npx percy app:exec -- node ${__dirname}/byos.js`;

        // Using execAsync to promisify the exec function
        const { stdout, stderr } = await execAsync(command);

        // Log the output of the command
        console.log("Command Output (stdout):", stdout);
        console.error("Command Error Output (stderr):", stderr);

        // Deleting the folder after execution
        fs.rmSync(resourcesPath, { recursive: true });
        console.log(`Deleted folder: resources`);
    } catch (error) {
        handleError(error);
    }
};

AppPercyFigma();