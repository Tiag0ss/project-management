using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.VisualStudio.Shell;

namespace ProjectManagement.PendingTasks
{
    [Guid("c3d4e5f6-a7b8-9012-cdef-123456789012")]
    public class PmOptionsPage : DialogPage
    {
        private string _baseUrl = "";
        private string _apiToken = "";
        private int _refreshIntervalSeconds = 300;
        private bool _aiAutoSubmit;

        [Category("Connection")]
        [DisplayName("Base URL")]
        [Description("Application base URL without trailing slash. Valid HTTPS or HTTP on LAN.")]
        public string BaseUrl
        {
            get => _baseUrl;
            set => _baseUrl = (value ?? "").Trim().TrimEnd('/');
        }

        [Category("Connection")]
        [DisplayName("API Token")]
        [Description("pt_… token from Profile → API Tokens")]
        [PasswordPropertyText(true)]
        public string ApiToken
        {
            get => _apiToken;
            set => _apiToken = value ?? "";
        }

        [Category("Behaviour")]
        [DisplayName("Refresh interval (seconds)")]
        [Description("0 = manual only")]
        public int RefreshIntervalSeconds
        {
            get => _refreshIntervalSeconds;
            set => _refreshIntervalSeconds = Math.Max(0, value);
        }

        [Category("AI")]
        [DisplayName("Auto-submit AI prompt")]
        [Description("When true, Send to AI submits immediately unless you choose Edit before send")]
        public bool AiAutoSubmit
        {
            get => _aiAutoSubmit;
            set => _aiAutoSubmit = value;
        }

        [Category("AI")]
        [DisplayName("Full-context prompt template")]
        [Description("Optional. Placeholders: {TaskName} {ProjectName} {StatusName} {PriorityName} {DueDate} {DescriptionPlain} {AppUrl}")]
        public string AiPromptTemplate { get; set; } = "";
    }
}
