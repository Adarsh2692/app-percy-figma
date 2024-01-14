const fs = require('fs/promises');
const path = require('path');
const percyScreenshot = require('@percy/appium-app');

function mockDriver({
  deviceName, // same as how SDK would get it
  os, // iOS / Android
  osVersion,
  deviceScreenSize, // width x height. eg 1080x1920
  statusBarHeight, // in px
  navigationBarHeight, // in px
  orientation, // portrait / landscape
  screenshotPath,
}) {
  const sessionCaps = {
    platformName: os,
    osVersion
  };

  if (os === 'Android') {
    sessionCaps.deviceScreenSize = deviceScreenSize;
    sessionCaps.desired = {
      deviceName,
    };
  } else if (os === 'iOS') {
    sessionCaps.deviceName = deviceName;
  }
  sessionCaps.viewportRect = { 
    left: 0, 
    top: statusBarHeight, 
    width: parseInt(deviceScreenSize.split('x')[0]), 
    height: parseInt(deviceScreenSize.split('x')[1]) - statusBarHeight - navigationBarHeight,
  };
  sessionCaps.pixelRatio = 1.0;
  sessionCaps.statBarHeight = statusBarHeight;

  return {
    // we need to have this unique per device/combination so making a string
    sessionID: `${deviceName}${osVersion}${os}${deviceScreenSize}${statusBarHeight}${orientation}`,
    configUrl: {
      hostname: 'localhost' // do not change
    },
    sessionCapabilities: () => sessionCaps,
    takeScreenshot: async () => await fs.readFile(screenshotPath, {encoding: 'base64'}),
    getOrientation: () => orientation
  };
}

async function uploadAll(folderPath) {
  folderPath = path.resolve(folderPath);
  const deviceFolders = await fs.readdir(folderPath);
  await Promise.all(deviceFolders.map(async (deviceFolder) => {
    if (deviceFolder === '.DS_Store') return;

    const fullDeviceFolderPath = path.join(folderPath, deviceFolder);
    const device = require(path.join(fullDeviceFolderPath, 'device.json'))
    
    const screenshots = await fs.readdir(fullDeviceFolderPath);
    await Promise.all(screenshots.map(async (screenshotName) => {
      if (screenshotName === 'device.json') return;

      console.log(`Processing ${device.deviceName}:${device.osVersion} - ${screenshotName}`)
      const fullScreenshotPath = path.join(fullDeviceFolderPath, screenshotName);
      const driver = mockDriver(Object.assign({}, device, { screenshotPath: fullScreenshotPath.toString() }));
      await percyScreenshot(driver, screenshotName.replace('.png', ''));
    }));
  }));
}

uploadAll('./resources').then('done')