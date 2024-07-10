const { spawn } = require('child_process');
const fs = require('fs').promises; // Use promises version for file operations
const path = require('path');

// Global variable for json file paths
const VERSIONS_FILE_PATH = './build_files/versions.json';
const TOOLS_FILE_PATH = './tools/tools.json';

// Global variable for default variales
const DEFAULT_PORT = '/dev/ttyUSB0';
const DEFAULT_BAUD = 115200;
const DEFAULT_FW_VER = 'v1.0.0';
const DEFAULT_TOOL_VER = 'default';
const DEFAULT_OFF_BOOT = '0x1000';
const DEFAULT_OFF_PART = '0x8000';
const DEFAULT_OFF_APP0 = '0xe000';
const DEFAULT_OFF_FW = '0x10000';

// Function to read versions.json file and parse its contents
async function getVersions() {
    try {
        const versionsFile = VERSIONS_FILE_PATH; // Path to versions.json
        const data = await fs.readFile(versionsFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        throw new Error(`Error reading versions.json: ${error.message}`);
    }
}

// Function to read tools.json file and parse its contents
async function getTools() {
    try {
        const versionsFile = TOOLS_FILE_PATH; // Path to tools.json
        const data = await fs.readFile(versionsFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        throw new Error(`Error reading tools.json: ${error.message}`);
    }
}

// Function to update the last used firmware version in versions.json
async function updateLastUsedVersion(version) {
    try {
        const versionsFile = VERSIONS_FILE_PATH; // Path to versions.json
        let versionsData = await getVersions();

        // Check if the version exists in the versions list
        const versionExists = versionsData.versions.some(v => v.version === version);
        if (!versionExists) {
            throw new Error(`Version ${version} not found in versions.json`);
        }

        // Update the last used version
        versionsData.last_used_version = version;

        await fs.writeFile(versionsFile, JSON.stringify(versionsData, null, 2));
    } catch (error) {
        throw new Error(`Error updating last used version in versions.json: ${error.message}`);
    }
}

// Function to get the path to firmware binaries based on version
async function getFirmwarePath(version) {
    try {
        const versionsData = await getVersions();
        const versions = versionsData.versions;

        // Check if the version exists in the versions list
        const versionExists = versions.some(v => v.version === version);
        if (!versionExists) {
            throw new Error(`Version ${version} not found in versions.json`);
        }

        // Replace periods with underscores in version number for path compatibility
        const sanitizedVersion = version.replace(/\./g, '_');

        const firmwareDir = `./build_files/${sanitizedVersion}`;

        // Check if firmware path exists
        try {
            await fs.access(firmwareDir);
            return firmwareDir;
        } catch (err) {
            throw new Error(`Firmware directory not found for version ${version}, path: ${firmwareDir}`);
        }
    } catch (error) {
        throw new Error(`Error reading versions.json: ${error.message}`);
    }
}

// Function to get the path to a specific tool version
async function getToolPath(toolVersion = "", firmwareVersion = "", subdirectory = "") {
    try {
        const data_versions = await getVersions();
        const versions_versions = data_versions.versions;
        const data_tools = await getTools();
        const versions_tools = data_tools.versions;

        // Resolve toolVersion based on inputs (default, latest, or specific version)
        if (toolVersion === "" || toolVersion === "default") {
            toolVersion = data_tools.default;
        } else if (toolVersion === "latest") {
            toolVersion = data_tools.latest;
        }

        // Check if the firmware version exists in versions.json
        const versionExists = versions_versions.some(v => v.version === firmwareVersion);
        if (!versionExists) {
            throw new Error(`Version ${firmwareVersion} not found in versions.json`);
        }

        // Check if the tool version exists in tools.json
        const toolExists = versions_tools.some(v => v.version === toolVersion);
        if (!toolExists) {
            throw new Error(`Version ${toolVersion} not found in tools.json`);
        }

        // Replace periods with underscores in tool version number for path compatibility
        const sanitizedVersion = toolVersion.replace(/\./g, '_');

        // Construct the base tool directory path
        const baseDir = `./tools/${sanitizedVersion}`;

        // Append subdirectory if provided
        let toolDir;
        if (subdirectory) {
            toolDir = path.join(baseDir, subdirectory);
        } else {
            toolDir = baseDir;
        }

        // Check if tool directory exists
        try {
            await fs.access(toolDir);
            return toolDir;
        } catch (err) {
            throw new Error(`Tool directory not found for version ${toolVersion}, path: ${toolDir}`);
        }
    } catch (error) {
        throw new Error(`Error reading tools.json: ${error.message}`);
    }
}

// Function to upload firmware to ESP32
function uploadFirmware(port, baud, version) {
    return new Promise(async (resolve, reject) => {
        try {
            // Fetch versions data and find the specific version details
            const versionsData = await getVersions();
            const versionData = versionsData.versions.find(v => v.version === version);
            if (!versionData) {
                throw new Error(`Version ${version} not found in versions.json`);
            }

            // Determine paths to firmware and related binaries
            const dir_bin = await getFirmwarePath(version);
            const path_firmware = path.join(dir_bin, 'firmware.bin');
            const path_partition = path.join(dir_bin, 'partitions.bin');

            // Retrieve flash offsets or use defaults
            const offset_bootloader = versionData.offset_bootloader || DEFAULT_OFF_BOOT;
            const offset_partitions = versionData.offset_partitions || DEFAULT_OFF_PART;
            const offset_app0 = versionData.offset_app0 || DEFAULT_OFF_APP0;
            const offset_firmware = versionData.offset_firmware || DEFAULT_OFF_FW;

            // Determine tool version or use default
            const toolVersion = versionData.toolVersion || DEFAULT_TOOL_VER;

            // Log SDK tool version for debugging
            console.log(`SDK tool version ${toolVersion}`);

            // Determine paths to bootloader and partitions based on tool version and firmware version
            const dir_sdk_bin = await getToolPath(toolVersion, version, 'sdk_bin');
            const path_bootloader = path.join(dir_sdk_bin, versionData.bootloader);

            const dir_partitions = await getToolPath(toolVersion, version, 'partitions');
            const path_app0 = path.join(dir_partitions, versionData.app0);

            // Prepare paths and flash offsets for firmware upload script
            const firmwarePaths = [path_bootloader, path_partition, path_app0, path_firmware];
            const flashOffsets = [offset_bootloader, offset_partitions, offset_app0, offset_firmware];

            // Define Python upload script and arguments
            const pythonScript = './espUpload.py';
            const args = [
                '--port', port,
                '--baud', baud.toString(),
                '--firmware_paths', ...firmwarePaths,
                '--flash_offsets', ...flashOffsets
            ];

            // Spawn Python process to execute firmware upload
            const pythonProcess = spawn('python3', [pythonScript, ...args]);

            // Handle stdout and stderr from the Python process
            pythonProcess.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
            });

            // Handle completion of the Python process
            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    // Update last used version upon successful firmware upload
                    updateLastUsedVersion(version)
                        .then(() => resolve('Firmware uploaded successfully'))
                        .catch(reject);
                } else {
                    reject(`Failed to upload firmware (exit code ${code})`);
                }
            });

            // Handle errors in spawning the Python process
            pythonProcess.on('error', (err) => {
                reject(err);
            });
        } catch (error) {
            reject(error);
        }
    });
}

// Function to initiate ESP32 firmware upload with default arguments
async function espUpload(port = DEFAULT_PORT, baud = DEFAULT_BAUD, version = DEFAULT_FW_VER) {
    try {
        console.log(`Uploading version ${version} with ${baud} baudrate to port: ${port}`);
        const result = await uploadFirmware(port, baud, version);
        console.log(result);
    } catch (error) {
        console.error('Error uploading firmware:', error);
    }
}

// Function to parse command line arguments
function parseArgs(argv) {
    const args = {};

    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '-port' && i + 1 < argv.length) {
            args.port = argv[i + 1];
        } else if (argv[i] === '-baud' && i + 1 < argv.length) {
            args.baud = parseInt(argv[i + 1], 10);
        } else if (argv[i] === '-ver' && i + 1 < argv.length) {
            args.version = argv[i + 1];
        }
    }

    return args;
}

// Parse command line arguments and initiate firmware upload
const args = parseArgs(process.argv);
espUpload(args.port, args.baud, args.version);
