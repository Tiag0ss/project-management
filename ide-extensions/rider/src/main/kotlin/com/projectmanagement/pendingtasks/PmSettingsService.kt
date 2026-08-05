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
    var kanbanLayout: String = "horizontal",
    var kanbanHiddenStatuses: String = "",
    var kanbanMaxVisibleCards: Int = 2,
    var aiInProgressStatusId: Int = 0,
)

@Service(Service.Level.APP)
@State(name = "PmPendingTasksSettings", storages = [Storage("ProjectManagementPendingTasks.xml")])
class PmSettingsService : PersistentStateComponent<PmSettingsState> {
    private var state = PmSettingsState()

    override fun getState(): PmSettingsState = state

    override fun loadState(state: PmSettingsState) {
        this.state = state
    }

    companion object {
        fun getInstance(): PmSettingsService =
            ApplicationManager.getApplication().getService(PmSettingsService::class.java)

        private fun credentialAttributes(): CredentialAttributes =
            CredentialAttributes(generateServiceName("ProjectManagement", "ApiToken"))

        fun getApiToken(): String {
            val creds = PasswordSafe.instance.get(credentialAttributes())
            return creds?.getPasswordAsString().orEmpty()
        }

        fun setApiToken(token: String) {
            if (token.isBlank()) {
                PasswordSafe.instance.set(credentialAttributes(), null)
            } else {
                PasswordSafe.instance.set(credentialAttributes(), Credentials("api", token.trim()))
            }
        }
    }
}
