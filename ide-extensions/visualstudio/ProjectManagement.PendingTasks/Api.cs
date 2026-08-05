using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace ProjectManagement.PendingTasks
{
    public sealed class PmTask
    {
        public int Id { get; set; }
        public int ProjectId { get; set; }
        public int OrganizationId { get; set; }
        public string? ProjectName { get; set; }
        public string TaskName { get; set; } = "";
        public string? Description { get; set; }
        public int Status { get; set; }
        public string? StatusName { get; set; }
        public int StatusIsClosed { get; set; }
        public int StatusIsCancelled { get; set; }
        public int StatusIsInProgress { get; set; }
        public int StatusHideFromPlanningAndStatistics { get; set; }
        public string? PriorityName { get; set; }
        public string? PriorityColor { get; set; }
        public int? PrioritySortOrder { get; set; }
        public int? DisplayOrder { get; set; }
        public string? DueDate { get; set; }
    }

    public sealed class PmStatusValue
    {
        public int Id { get; set; }
        public string StatusName { get; set; } = "";
        public int? SortOrder { get; set; }
        public int IsClosed { get; set; }
        public int IsCancelled { get; set; }
        public int IsInProgress { get; set; }
    }

    public static class HtmlPlainText
    {
        public static string Strip(string? html)
        {
            if (string.IsNullOrWhiteSpace(html)) return "";
            var text = html!;
            text = Regex.Replace(text, "<style[\\s\\S]*?</style>", " ", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, "<script[\\s\\S]*?</script>", " ", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, "<br\\s*/?>", "\n", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, "</p>", "\n\n", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, "<[^>]+>", " ");
            text = text.Replace("&nbsp;", " ", StringComparison.OrdinalIgnoreCase)
                .Replace("&amp;", "&", StringComparison.OrdinalIgnoreCase)
                .Replace("&lt;", "<", StringComparison.OrdinalIgnoreCase)
                .Replace("&gt;", ">", StringComparison.OrdinalIgnoreCase)
                .Replace("&quot;", "\"", StringComparison.OrdinalIgnoreCase)
                .Replace("&#39;", "'");
            text = Regex.Replace(text, "[ \\t]{2,}", " ");
            text = Regex.Replace(text, "\\n{3,}", "\n\n");
            return text.Trim();
        }
    }

    public static class TaskRules
    {
        public static bool IsPending(PmTask t) =>
            t.StatusIsClosed != 1 && t.StatusIsCancelled != 1 && t.StatusHideFromPlanningAndStatistics != 1;

        private static long? DueDay(string? due)
        {
            if (string.IsNullOrWhiteSpace(due) || due!.Length < 10) return null;
            if (DateTime.TryParse(due.Substring(0, 10), out var d))
                return d.Date.Ticks;
            return null;
        }

        public static int Compare(PmTask a, PmTask b)
        {
            var today = DateTime.Today.Ticks;
            var aDue = DueDay(a.DueDate);
            var bDue = DueDay(b.DueDate);
            var aOverdue = aDue.HasValue && aDue.Value < today ? 0 : 1;
            var bOverdue = bDue.HasValue && bDue.Value < today ? 0 : 1;
            if (aOverdue != bOverdue) return aOverdue - bOverdue;
            if (!aDue.HasValue && bDue.HasValue) return 1;
            if (aDue.HasValue && !bDue.HasValue) return -1;
            if (aDue.HasValue && bDue.HasValue && aDue.Value != bDue.Value)
                return aDue.Value.CompareTo(bDue.Value);
            var aPri = a.PrioritySortOrder ?? 9999;
            var bPri = b.PrioritySortOrder ?? 9999;
            if (aPri != bPri) return aPri.CompareTo(bPri);
            return string.Compare(a.TaskName, b.TaskName, StringComparison.OrdinalIgnoreCase);
        }

        public static IEnumerable<IGrouping<string, PmTask>> GroupByProject(IEnumerable<PmTask> tasks) =>
            tasks.GroupBy(t => string.IsNullOrWhiteSpace(t.ProjectName) ? $"Project #{t.ProjectId}" : t.ProjectName!.Trim())
                .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
                .Select(g => new SortedGrouping(g.Key, g.OrderBy(t => t, Comparer<PmTask>.Create(Compare))));

        private sealed class SortedGrouping : IGrouping<string, PmTask>
        {
            private readonly IEnumerable<PmTask> _items;
            public SortedGrouping(string key, IEnumerable<PmTask> items) { Key = key; _items = items; }
            public string Key { get; }
            public IEnumerator<PmTask> GetEnumerator() => _items.GetEnumerator();
            System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
        }
    }

    public enum AiContentMode { Name, NameDescription, Full }

    public static class AiPromptBuilder
    {
        public static string Build(PmTask task, string baseUrl, AiContentMode mode, string? customFull = null)
        {
            var plain = HtmlPlainText.Strip(task.Description);
            var appUrl = $"{baseUrl.TrimEnd('/')}/projects/{task.ProjectId}";
            var due = string.IsNullOrWhiteSpace(task.DueDate) ? "—" : task.DueDate!.Split('T')[0];

            if (mode == AiContentMode.Name)
                return $"Help me work on this task: {task.TaskName}";

            if (mode == AiContentMode.NameDescription)
                return $"Help me work on this task:\n\nTitle: {task.TaskName}\n\nDescription:\n{(string.IsNullOrWhiteSpace(plain) ? "—" : plain)}";

            var template = string.IsNullOrWhiteSpace(customFull)
                ? "Help me work on this task:\n\nTitle: {TaskName}\nProject: {ProjectName}\nStatus: {StatusName}\nPriority: {PriorityName}\nDue: {DueDate}\n\nDescription:\n{DescriptionPlain}\n\nApp: {AppUrl}"
                : customFull!;

            return template
                .Replace("{TaskName}", string.IsNullOrWhiteSpace(task.TaskName) ? "—" : task.TaskName)
                .Replace("{ProjectName}", task.ProjectName ?? "—")
                .Replace("{StatusName}", task.StatusName ?? "—")
                .Replace("{PriorityName}", task.PriorityName ?? "—")
                .Replace("{DueDate}", due)
                .Replace("{DescriptionPlain}", string.IsNullOrWhiteSpace(plain) ? "—" : plain)
                .Replace("{AppUrl}", appUrl);
        }
    }

    public static class PmApi
    {
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };

        public static async Task<string> TestConnectionAsync(string baseUrl, string token)
        {
            var json = await GetAsync(baseUrl, token, "/api/user/profile");
            dynamic? obj = JsonConvert.DeserializeObject(json);
            return (string?)(obj?.username ?? obj?.Username ?? obj?.email ?? obj?.Email) ?? "user";
        }

        public static async Task<List<PmTask>> FetchPendingTasksAsync(string baseUrl, string token)
        {
            var json = await GetAsync(baseUrl, token, "/api/tasks/my-tasks");
            var wrapper = JsonConvert.DeserializeObject<MyTasksResponse>(json);
            return (wrapper?.Tasks ?? new List<PmTask>()).Where(TaskRules.IsPending).ToList();
        }

        public static async Task<List<PmStatusValue>> FetchTaskStatusesAsync(string baseUrl, string token, int organizationId)
        {
            var json = await GetAsync(baseUrl, token, $"/api/status-values/task/{organizationId}");
            var wrapper = JsonConvert.DeserializeObject<StatusValuesResponse>(json);
            return (wrapper?.Statuses ?? new List<PmStatusValue>())
                .OrderBy(s => s.SortOrder ?? 9999)
                .ToList();
        }

        public static async Task UpdateTaskStatusAsync(string baseUrl, string token, int taskId, int statusId)
        {
            await SendAsync(baseUrl, token, $"/api/tasks/{taskId}", HttpMethod.Put, $"{{\"status\":{statusId}}}");
        }

        public static async Task<string> ProxyJsonAsync(
            string baseUrl,
            string token,
            string path,
            string method,
            string? jsonBody)
        {
            var httpMethod = new HttpMethod((method ?? "GET").ToUpperInvariant());
            return await SendAsync(baseUrl, token, path, httpMethod, jsonBody);
        }

        private static async Task<string> GetAsync(string baseUrl, string token, string path)
        {
            return await SendAsync(baseUrl, token, path, HttpMethod.Get, null);
        }

        private static async Task<string> SendAsync(string baseUrl, string token, string path, HttpMethod method, string? jsonBody)
        {
            if (string.IsNullOrWhiteSpace(baseUrl)) throw new InvalidOperationException("Base URL is not configured");
            if (string.IsNullOrWhiteSpace(token)) throw new InvalidOperationException("API token is not configured");

            using var req = new HttpRequestMessage(method, baseUrl.TrimEnd('/') + path);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            if (jsonBody != null)
            {
                req.Content = new StringContent(jsonBody, System.Text.Encoding.UTF8, "application/json");
            }

            HttpResponseMessage res;
            try
            {
                res = await Http.SendAsync(req);
            }
            catch (Exception ex) when (ex.Message.IndexOf("SSL", StringComparison.OrdinalIgnoreCase) >= 0
                                       || ex.Message.IndexOf("certificate", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                throw new InvalidOperationException(
                    "TLS error (self-signed certificates are not supported in v1). Use a valid certificate or HTTP on LAN/VPN.");
            }

            var body = await res.Content.ReadAsStringAsync();
            if ((int)res.StatusCode == 401 || (int)res.StatusCode == 403)
                throw new InvalidOperationException(
                    string.IsNullOrWhiteSpace(TryReadMessage(body))
                        ? "Unauthorized — check your API token (pt_…) or permissions"
                        : TryReadMessage(body)!);
            if (!res.IsSuccessStatusCode)
                throw new InvalidOperationException(TryReadMessage(body) ?? $"HTTP {(int)res.StatusCode}");
            return body;
        }

        private static string? TryReadMessage(string body)
        {
            try
            {
                dynamic? obj = JsonConvert.DeserializeObject(body);
                return (string?)obj?.message;
            }
            catch
            {
                return null;
            }
        }

        private sealed class MyTasksResponse
        {
            [JsonProperty("tasks")]
            public List<PmTask>? Tasks { get; set; }
        }

        private sealed class StatusValuesResponse
        {
            [JsonProperty("statuses")]
            public List<PmStatusValue>? Statuses { get; set; }
        }
    }
}
