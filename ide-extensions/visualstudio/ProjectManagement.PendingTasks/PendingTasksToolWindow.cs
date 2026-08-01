using System;
using System.ComponentModel.Design;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;

namespace ProjectManagement.PendingTasks
{
    [Guid("d4e5f6a7-b8c9-0123-def0-234567890123")]
    public class PendingTasksToolWindow : ToolWindowPane
    {
        public PendingTasksControl Control { get; }

        public PendingTasksToolWindow() : base(null)
        {
            Caption = "PM Pending Tasks";
            Control = new PendingTasksControl();
            Content = Control;
        }
    }

    public sealed class PendingTasksControl : UserControl
    {
        private readonly ListBox _list = new ListBox();
        private readonly TextBlock _status = new TextBlock { Margin = new Thickness(8, 4, 8, 8) };
        private readonly PendingTasksPackage? _package;

        public PendingTasksControl(PendingTasksPackage? package = null)
        {
            _package = package;
            var root = new DockPanel { Margin = new Thickness(8) };

            var toolbar = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 8) };
            toolbar.Children.Add(MakeButton("Refresh", (_, __) => _ = ReloadAsync()));
            toolbar.Children.Add(MakeButton("Open in browser", (_, __) => OpenSelected()));
            toolbar.Children.Add(MakeButton("Send to AI Chat…", (_, __) => SendToAi()));

            DockPanel.SetDock(toolbar, Dock.Top);
            DockPanel.SetDock(_status, Dock.Bottom);
            root.Children.Add(toolbar);
            root.Children.Add(_status);
            root.Children.Add(_list);

            Content = root;
            _ = ReloadAsync();
        }

        private static Button MakeButton(string text, RoutedEventHandler handler)
        {
            var b = new Button { Content = text, Margin = new Thickness(0, 0, 8, 0), Padding = new Thickness(8, 4, 8, 4) };
            b.Click += handler;
            return b;
        }

        private PmOptionsPage? Options
        {
            get
            {
                try
                {
                    var pkg = _package ?? (PendingTasksPackage?)ServiceProvider.GlobalProvider.GetService(typeof(PendingTasksPackage));
                    return pkg?.GetDialogPage(typeof(PmOptionsPage)) as PmOptionsPage;
                }
                catch
                {
                    return null;
                }
            }
        }

        public async System.Threading.Tasks.Task ReloadAsync()
        {
            var opt = Options;
            if (opt == null || string.IsNullOrWhiteSpace(opt.BaseUrl) || string.IsNullOrWhiteSpace(opt.ApiToken))
            {
                _status.Text = "Configure Tools → Options → Project Management";
                _list.Items.Clear();
                return;
            }

            _status.Text = "Loading…";
            try
            {
                var tasks = await PmApi.FetchPendingTasksAsync(opt.BaseUrl, opt.ApiToken);
                var flat = TaskRules.GroupByProject(tasks).SelectMany(g => g).ToList();
                await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
                _list.Items.Clear();
                foreach (var t in flat)
                {
                    var due = string.IsNullOrWhiteSpace(t.DueDate) ? "" : t.DueDate!.Split('T')[0];
                    var meta = string.Join(" · ", new[] { t.ProjectName, t.StatusName, t.PriorityName, due }.Where(s => !string.IsNullOrWhiteSpace(s)));
                    _list.Items.Add(new TaskListItem(t, $"{t.TaskName}  —  {meta}"));
                }
                _status.Text = $"{flat.Count} pending task(s)";
            }
            catch (Exception ex)
            {
                await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
                _list.Items.Clear();
                _status.Text = ex.Message;
                _status.Foreground = Brushes.IndianRed;
            }
        }

        private PmTask? SelectedTask => (_list.SelectedItem as TaskListItem)?.Task;

        private void OpenSelected()
        {
            var task = SelectedTask;
            var opt = Options;
            if (task == null || opt == null || string.IsNullOrWhiteSpace(opt.BaseUrl)) return;
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = $"{opt.BaseUrl.TrimEnd('/')}/projects/{task.ProjectId}",
                UseShellExecute = true
            });
        }

        private void SendToAi()
        {
            var task = SelectedTask;
            var opt = Options;
            if (task == null || opt == null)
            {
                MessageBox.Show("Select a task first.");
                return;
            }

            var content = MessageBox.Show(
                "Yes = Full context\nNo = Name + description\nCancel = Name only",
                "AI prompt content",
                MessageBoxButton.YesNoCancel,
                MessageBoxImage.Question);

            AiContentMode mode = content switch
            {
                MessageBoxResult.Yes => AiContentMode.Full,
                MessageBoxResult.No => AiContentMode.NameDescription,
                MessageBoxResult.Cancel => AiContentMode.Name,
                _ => AiContentMode.Full
            };
            if (content == MessageBoxResult.None) return;

            var sendNow = opt.AiAutoSubmit;
            var modeResult = MessageBox.Show(
                "Yes = Send now\nNo = Edit before send (copy to clipboard)",
                "Send mode",
                MessageBoxButton.YesNoCancel);
            if (modeResult == MessageBoxResult.Cancel) return;
            sendNow = modeResult == MessageBoxResult.Yes;

            var prompt = AiPromptBuilder.Build(task, opt.BaseUrl, mode, opt.AiPromptTemplate);
            Clipboard.SetText(prompt);

            // Copilot Chat prefill/submit APIs vary by VS version — clipboard is the reliable path.
            MessageBox.Show(
                sendNow
                    ? "Prompt copied. Paste into Copilot Chat and send (host-specific auto-submit is best-effort in v1)."
                    : "Prompt copied to clipboard — paste into Copilot Chat and edit before sending.",
                "Send to AI Chat");
        }

        private sealed class TaskListItem
        {
            public TaskListItem(PmTask task, string display) { Task = task; Display = display; }
            public PmTask Task { get; }
            public string Display { get; }
            public override string ToString() => Display;
        }
    }

    internal sealed class PendingTasksToolWindowCommand
    {
        public static async System.Threading.Tasks.Task InitializeAsync(AsyncPackage package)
        {
            await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync(package.DisposalToken);
            var commandService = await package.GetServiceAsync(typeof(IMenuCommandService)) as OleMenuCommandService
                ?? throw new InvalidOperationException("Cannot get menu service");

            var cmdId = new CommandID(PackageGuids.CommandSetGuid, PackageIds.PendingTasksCommandId);
            commandService.AddCommand(new MenuCommand((s, e) =>
            {
                ThreadHelper.ThrowIfNotOnUIThread();
                ToolWindowPane window = package.FindToolWindow(typeof(PendingTasksToolWindow), 0, true);
                if (window?.Frame is IVsWindowFrame frame)
                {
                    Microsoft.VisualStudio.ErrorHandler.ThrowOnFailure(frame.Show());
                }
            }, cmdId));
        }
    }
}
