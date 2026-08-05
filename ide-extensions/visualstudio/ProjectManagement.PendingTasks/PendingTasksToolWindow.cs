using System;
using System.ComponentModel.Design;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ProjectManagement.PendingTasks
{
    [Guid("d4e5f6a7-b8c9-0123-def0-234567890123")]
    public class PendingTasksToolWindow : ToolWindowPane
    {
        public PendingTasksToolWindow() : base(null)
        {
            Caption = "PM Kanban";
            Content = new KanbanControl(this);
        }
    }

    public sealed class KanbanControl : UserControl
    {
        private readonly ToolWindowPane _pane;
        private readonly WebView2 _webView = new WebView2();
        private bool _ready;

        public KanbanControl(ToolWindowPane pane)
        {
            _pane = pane;
            Content = _webView;
            Loaded += async (_, __) => await EnsureWebViewAsync();
        }

        private PmOptionsPage? Options
        {
            get
            {
                try
                {
                    var pkg = _pane.Package as PendingTasksPackage
                              ?? (PendingTasksPackage?)ServiceProvider.GlobalProvider.GetService(typeof(PendingTasksPackage));
                    return pkg?.GetDialogPage(typeof(PmOptionsPage)) as PmOptionsPage;
                }
                catch
                {
                    return null;
                }
            }
        }

        private async System.Threading.Tasks.Task EnsureWebViewAsync()
        {
            if (_ready) return;
            try
            {
                await _webView.EnsureCoreWebView2Async();
                _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
                _webView.CoreWebView2.Settings.IsWebMessageEnabled = true;
                _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
                _webView.CoreWebView2.NavigationCompleted += async (_, __) => await PushConfigAsync();
                _webView.NavigateToString(BuildHtml());
                _ready = true;
            }
            catch (Exception ex)
            {
                Content = new TextBlock
                {
                    Text = "WebView2 failed to start. Install the WebView2 Runtime.\n" + ex.Message,
                    Margin = new Thickness(12),
                    TextWrapping = TextWrapping.Wrap
                };
            }
        }

        private static string ReadSiblingResource(string fileName)
        {
            var asmDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? "";
            var path = Path.Combine(asmDir, "Resources", "kanban", fileName);
            if (File.Exists(path)) return File.ReadAllText(path);
            // Fallback: next to project output without Resources nesting
            path = Path.Combine(asmDir, "kanban", fileName);
            if (File.Exists(path)) return File.ReadAllText(path);
            throw new FileNotFoundException("Missing kanban asset: " + fileName);
        }

        private string BuildHtml()
        {
            var css = ReadSiblingResource("board.css");
            var js = ReadSiblingResource("board.js");
            return $@"<!DOCTYPE html>
<html lang=""en"">
<head>
  <meta charset=""UTF-8"" />
  <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"" />
  <title>Project Management — Kanban</title>
  <style>{css}</style>
</head>
<body>
  <div id=""toolbar"">
    <label for=""projectSelect"">Project</label>
    <select id=""projectSelect"" aria-label=""Project""></select>
    <button type=""button"" id=""refreshBtn"">Refresh</button>
    <button type=""button"" id=""configureBtn"" class=""primary"">Configure</button>
  </div>
  <div id=""statusLine"" aria-live=""polite""></div>
  <div id=""board"" role=""list""></div>
  <div id=""emptyState""></div>
  <script>{js}</script>
</body>
</html>";
        }

        private async System.Threading.Tasks.Task PushConfigAsync()
        {
            var opt = Options;
            if (_webView.CoreWebView2 == null) return;
            var payload = new
            {
                type = "config",
                baseUrl = opt?.BaseUrl ?? "",
                token = "",
                proxyViaHost = true,
                selectedProjectId = (opt?.SelectedProjectId ?? 0) > 0 ? (int?)opt!.SelectedProjectId : null,
                layout = opt?.KanbanLayout ?? "horizontal",
                hiddenStatuses = opt?.KanbanHiddenStatuses ?? "",
                maxVisibleCards = opt?.KanbanMaxVisibleCards ?? 2
            };
            _webView.CoreWebView2.PostWebMessageAsJson(JsonConvert.SerializeObject(payload));
            await System.Threading.Tasks.Task.CompletedTask;
        }

        private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            JObject? obj;
            try
            {
                obj = JObject.Parse(e.WebMessageAsJson);
            }
            catch
            {
                return;
            }

            var type = obj?["type"]?.ToString();
            switch (type)
            {
                case "ready":
                    _ = PushConfigAsync();
                    break;
                case "configure":
                    System.Windows.MessageBox.Show(
                        "Open Tools → Options → Project Management to set Base URL and API token, then click Refresh on the board.",
                        "Configure Connection");
                    break;
                case "projectSelected":
                    {
                        var opt = Options;
                        if (opt == null) break;
                        var id = obj?["projectId"]?.Type == JTokenType.Null ? 0 : (int?)obj?["projectId"] ?? 0;
                        opt.SelectedProjectId = id;
                    }
                    break;
                case "openExternal":
                    {
                        var url = obj?["url"]?.ToString();
                        if (!string.IsNullOrWhiteSpace(url))
                        {
                            try { System.Diagnostics.Process.Start(url); }
                            catch (Exception ex)
                            {
                                System.Windows.MessageBox.Show(ex.Message, "Open in browser");
                            }
                        }
                    }
                    break;
                case "sendToAi":
                    {
                        var taskToken = obj?["task"];
                        if (taskToken == null) break;
                        var task = taskToken.ToObject<PmTask>();
                        if (task != null) SendToAi(task);
                    }
                    break;
                case "error":
                    {
                        var message = obj?["message"]?.ToString();
                        if (!string.IsNullOrWhiteSpace(message))
                            System.Windows.MessageBox.Show(message, "Project Management");
                    }
                    break;
                case "apiRequest":
                    _ = HandleApiRequestAsync(obj!);
                    break;
            }
        }

        private async System.Threading.Tasks.Task HandleApiRequestAsync(JObject obj)
        {
            var requestId = obj["requestId"]?.ToString() ?? "";
            var path = obj["path"]?.ToString() ?? "";
            var method = obj["method"]?.ToString() ?? "GET";
            var bodyToken = obj["body"];
            string? jsonBody = bodyToken == null || bodyToken.Type == JTokenType.Null
                ? null
                : bodyToken.ToString(Formatting.None);

            try
            {
                var opt = Options;
                var baseUrl = opt?.BaseUrl ?? "";
                var token = opt?.ApiToken ?? "";
                var dataJson = await PmApi.ProxyJsonAsync(baseUrl, token, path, method, jsonBody);
                var data = JsonConvert.DeserializeObject(dataJson);
                var response = new
                {
                    type = "apiResponse",
                    requestId,
                    ok = true,
                    data
                };
                _webView.CoreWebView2?.PostWebMessageAsJson(JsonConvert.SerializeObject(response));
            }
            catch (Exception ex)
            {
                var response = new
                {
                    type = "apiResponse",
                    requestId,
                    ok = false,
                    error = ex.Message
                };
                _webView.CoreWebView2?.PostWebMessageAsJson(JsonConvert.SerializeObject(response));
            }
        }

        private void SendToAi(PmTask task)
        {
            var opt = Options;
            var baseUrl = opt?.BaseUrl ?? "";
            if (string.IsNullOrWhiteSpace(baseUrl))
            {
                System.Windows.MessageBox.Show("Configure Base URL first.", "Send to AI Chat");
                return;
            }

            var content = System.Windows.MessageBox.Show(
                "Yes = Full context\nNo = Name + description\nCancel = Name only",
                "AI prompt content",
                MessageBoxButton.YesNoCancel,
                MessageBoxImage.Question);
            if (content == MessageBoxResult.None) return;
            var mode = content == MessageBoxResult.Yes
                ? AiContentMode.Full
                : content == MessageBoxResult.No
                    ? AiContentMode.NameDescription
                    : AiContentMode.Name;

            var defaultAuto = opt?.AiAutoSubmit == true;
            var sendNow = System.Windows.MessageBox.Show(
                "Yes = Send now\nNo = Edit before send (copy to clipboard)",
                "Send mode",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question) == MessageBoxResult.Yes;
            if (!sendNow && defaultAuto)
            {
                // User chose edit; keep clipboard path
            }

            var prompt = AiPromptBuilder.Build(task, baseUrl, mode, opt?.AiPromptTemplate);
            try
            {
                System.Windows.Clipboard.SetText(prompt);
            }
            catch
            {
                /* ignore */
            }

            System.Windows.MessageBox.Show(
                sendNow
                    ? "Prompt copied. Paste into Copilot Chat and send (host-specific auto-submit is best-effort in v1)."
                    : "Prompt copied to clipboard — paste into Copilot Chat and edit before sending.",
                "Send to AI Chat");
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
