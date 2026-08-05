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
        private int _selectedProjectId;
        private string _kanbanLayout = "horizontal";
        private string _kanbanHiddenStatuses = "";
        private int _kanbanMaxVisibleCards = 2;
        private int _aiInProgressStatusId;

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

        [Category("Behaviour")]
        [DisplayName("Selected project id")]
        [Description("Last project opened in the Kanban tool window (set automatically)")]
        public int SelectedProjectId
        {
            get => _selectedProjectId;
            set => _selectedProjectId = Math.Max(0, value);
        }

        [Category("Kanban")]
        [DisplayName("Layout")]
        [Description("horizontal = columns side-by-side; vertical = stacked status sections")]
        public string KanbanLayout
        {
            get => _kanbanLayout;
            set => _kanbanLayout = string.Equals(value, "vertical", StringComparison.OrdinalIgnoreCase) ? "vertical" : "horizontal";
        }

        [Category("Kanban")]
        [DisplayName("Hidden statuses")]
        [Description("Status names to hide, separated by semicolons (case-insensitive). Example: Done; Cancelled")]
        public string KanbanHiddenStatuses
        {
            get => _kanbanHiddenStatuses;
            set => _kanbanHiddenStatuses = value ?? "";
        }

        [Category("Kanban")]
        [DisplayName("Max visible cards")]
        [Description("Max cards per status before Show more (0 = show all)")]
        public int KanbanMaxVisibleCards
        {
            get => _kanbanMaxVisibleCards;
            set => _kanbanMaxVisibleCards = Math.Max(0, value);
        }

        [Category("AI")]
        [DisplayName("In Progress status Id")]
        [Description("Status Id to set when sending a task to AI (0 = use org IsInProgress flag)")]
        public int AiInProgressStatusId
        {
            get => _aiInProgressStatusId;
            set => _aiInProgressStatusId = Math.Max(0, value);
        }

        [Category("AI")]
        [DisplayName("Full-context prompt template")]
        [Description("Optional. Placeholders: {TaskName} {ProjectName} {StatusName} {PriorityName} {DueDate} {DescriptionPlain} {AppUrl}")]
        public string AiPromptTemplate { get; set; } = "";
    }
}
