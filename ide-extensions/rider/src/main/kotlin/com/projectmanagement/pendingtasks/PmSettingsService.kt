package com.projectmanagement.pendingtasks

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

data class PmSettingsState(
    var baseUrl: String = "",
    var refreshIntervalSeconds: Int = 300,
    var aiPromptTemplate: String = "",
    var selectedProjectId: Int = 0,
    var selectedSprintFilter: String = "all",
    var kanbanLayout: String = "horizontal",
    var kanbanHiddenStatuses: String = "",
    var kanbanMaxVisibleCards: Int = 2,
    var aiInProgressStatusId: Int = 0,
    /**
     * Durable fallback for the API token.
     * PasswordSafe is preferred, but on Linux it is often memory-only
     * (Settings → Appearance & Behavior → System Settings → Passwords),
     * which clears the token on every IDE restart.
     */
    var apiToken: String = "",
)

@Service(Service.Level.APP)
@State(name = "PmPendingTasksSettings", storages = [Storage("ProjectManagementPendingTasks.xml")])
class PmSettingsService : PersistentStateComponent<PmSettingsState> {
    private var state = PmSettingsState()

    override fun getState(): PmSettingsState = state

    override fun loadState(state: PmSettingsState) {
        this.state = state
        // If PasswordSafe kept a token and XML did not (older versions), mirror it once.
        val fromSafe = readPasswordSafe()
        if (this.state.apiToken.isBlank() && fromSafe.isNotEmpty()) {
            this.state.apiToken = fromSafe
        }
    }

    companion object {
        fun getInstance(): PmSettingsService =
            ApplicationManager.getApplication().getService(PmSettingsService::class.java)

        private fun credentialAttributes(): CredentialAttributes =
            CredentialAttributes(
                generateServiceName("ProjectManagement", "ApiToken"),
                "api",
                PmSettingsService::class.java,
                false,
            )

        private fun readPasswordSafe(): String {
            return try {
                PasswordSafe.instance.get(credentialAttributes())?.getPasswordAsString().orEmpty()
            } catch (_: Exception) {
                ""
            }
        }

        fun getApiToken(): String {
            val fromSafe = readPasswordSafe()
            if (fromSafe.isNotEmpty()) return fromSafe
            return getInstance().state.apiToken
        }

        fun setApiToken(token: String) {
            val trimmed = token.trim()
            val attrs = credentialAttributes()
            val service = getInstance()

            if (trimmed.isBlank()) {
                try {
                    PasswordSafe.instance.set(attrs, null)
                } catch (_: Exception) {
                    // ignore
                }
                service.state.apiToken = ""
                return
            }

            // Always persist in plugin state so restarts keep the token even when
            // PasswordSafe is configured as "Do not save, forget after restart".
            service.state.apiToken = trimmed

            try {
                PasswordSafe.instance.set(attrs, Credentials("api", trimmed))
            } catch (_: Exception) {
                // State fallback already written.
            }
        }
    }
}
