using System;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.VisualStudio.Shell;
using Task = System.Threading.Tasks.Task;

namespace ProjectManagement.PendingTasks
{
    [PackageRegistration(UseManagedResourcesOnly = true, AllowsBackgroundLoading = true)]
    [InstalledProductRegistration("Project Management — Pending Tasks", "Pending tasks via API token", "0.1.0")]
    [ProvideMenuResource("Menus.ctmenu", 1)]
    [ProvideToolWindow(typeof(PendingTasksToolWindow))]
    [ProvideOptionPage(typeof(PmOptionsPage), "Project Management", "General", 0, 0, true)]
    [Guid(PackageGuids.PackageString)]
    public sealed class PendingTasksPackage : AsyncPackage
    {
        protected override async Task InitializeAsync(CancellationToken cancellationToken, IProgress<ServiceProgressData> progress)
        {
            await JoinableTaskFactory.SwitchToMainThreadAsync(cancellationToken);
            await PendingTasksToolWindowCommand.InitializeAsync(this);
        }
    }

    internal static class PackageGuids
    {
        public const string PackageString = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
        public static readonly Guid PackageGuid = new Guid(PackageString);
        public const string CommandSetString = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
        public static readonly Guid CommandSetGuid = new Guid(CommandSetString);
    }

    internal static class PackageIds
    {
        public const int PendingTasksCommandId = 0x0100;
    }
}
