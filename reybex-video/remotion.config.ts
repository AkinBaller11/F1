import {Config} from '@remotion/cli/config';
import fs from 'fs';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCodec('h264');
Config.setCrf(16);
Config.setPixelFormat('yuv420p');

// In der Cloud-Umgebung ist ein Headless-Chrome vorinstalliert. Lokal lädt Remotion selbst einen.
const localShell =
  '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
if (fs.existsSync(localShell)) {
  Config.setBrowserExecutable(localShell);
}
