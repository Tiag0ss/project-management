import {
  isDesktopInstallerFile,
  isIdeExtensionFile,
} from '../../server/utils/downloads';

describe('isDesktopInstallerFile', () => {
  it('matches Windows and Linux desktop timer packages', () => {
    expect(isDesktopInstallerFile('PM Desktop Timer Setup 0.2.0.exe', 'win')).toBe(true);
    expect(isDesktopInstallerFile('PM Desktop Timer-0.2.0.AppImage', 'linux')).toBe(true);
  });

  it('rejects wrong platform or unrelated files', () => {
    expect(isDesktopInstallerFile('PM Desktop Timer Setup 0.2.0.exe', 'linux')).toBe(false);
    expect(isDesktopInstallerFile('other-setup.exe', 'win')).toBe(false);
  });
});

describe('isIdeExtensionFile', () => {
  it('matches VS Code / Cursor VSIX by package name', () => {
    expect(isIdeExtensionFile('project-management-pending-tasks-1.0.0.vsix', 'vscode')).toBe(true);
    expect(isIdeExtensionFile('ProjectManagement.PendingTasks.vsix', 'vscode')).toBe(false);
  });

  it('matches Rider zip packages', () => {
    expect(isIdeExtensionFile('pending-tasks-rider-1.0.0.zip', 'rider')).toBe(true);
    expect(isIdeExtensionFile('project-management-pending-tasks-1.0.0.vsix', 'rider')).toBe(false);
  });

  it('matches Visual Studio VSIX without claiming the VS Code package', () => {
    expect(isIdeExtensionFile('ProjectManagement.PendingTasks.vsix', 'visualstudio')).toBe(true);
    expect(isIdeExtensionFile('project-management-pending-tasks-1.0.0.vsix', 'visualstudio')).toBe(false);
  });
});
