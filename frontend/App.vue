<template>
  <div class="login-container" v-show="!busy && !user">
    <div class="login-logo"><img src="/favicon.png"/></div>
    <h1>NG Release Bell</h1>
    <a :href="loginUrl"><Button id="loginButton" label="Login"/></a>
  </div>
  <MainLayout v-show="!busy && user">
    <template #dialogs>
      <!-- Add Project Dialog -->
      <Dialog header="Add Project" v-model:visible="addProjectDialog.visible" :dismissableMask="true" :closable="true" :style="{ maxWidth: '100%', width: '1028px'}" :modal="true">
        <form @submit="onAddProjectSubmit()" @submit.prevent>
          <div>
            <div class="form-field">
              <label for="addProjectTypeInput">Type</label>
              <Dropdown v-model="addProjectDialog.type" :options="availableProjectTypes" optionLabel="name" optionDisabled="disabled" inputId="addProjectTypeInput"/>
            </div>
            <div class="form-field">
              <label for="addProjectUrlInput">{{ addProjectInputLabel }}</label>
              <InputText id="addProjectUrlInput" type="text" v-model="addProjectDialog.url" autofocus required :placeholder="addProjectInputPlaceholder" :class="{ 'p-invalid': addProjectDialog.error }"/>
              <small class="p-invalid" v-show="addProjectDialog.error">{{ addProjectDialog.error }}</small>
            </div>
            <div class="info-note">
              <i class="pi pi-info-circle" style="color: var(--text-color-secondary, #999); margin-right: 4px;"></i>
              <small>Only the 50 most recent versions are tracked. Older releases will not be imported.</small>
            </div>
          </div>
        </form>
        <template #footer>
          <Button label="Cancel" icon="pi pi-times" class="p-button-text" @click="addProjectDialog.visible = false"/>
          <Button label="Add" id="addProjectSubmitButton" :icon="addProjectDialog.busy ? 'pi pi-spin pi-spinner' : 'pi pi-check'" :disabled="!addProjectDialog.url || addProjectDialog.busy" class="p-button-text p-button-success" @click="onAddProjectSubmit()"/>
        </template>
      </Dialog>

      <!-- Edit Project Dialog -->
      <Dialog header="Edit Project" v-model:visible="editProjectDialog.visible" :dismissableMask="true" :closable="true" :style="{ maxWidth: '100%', width: '1028px'}" :modal="true">
        <form @submit="onEditProjectSubmit()" @submit.prevent>
          <div>
            <div class="form-field">
              <label for="editProjectTypeInput">Type</label>
              <Dropdown v-model="editProjectDialog.type" :options="availableProjectTypes" optionLabel="name" optionDisabled="disabled" inputId="editProjectTypeInput"/>
            </div>
            <div class="form-field">
              <label for="editProjectNameInput">Name</label>
              <InputText id="editProjectNameInput" type="text" v-model="editProjectDialog.name" autofocus required :class="{ 'p-invalid': editProjectDialog.error }"/>
              <small class="p-invalid" v-show="editProjectDialog.error">{{ editProjectDialog.error }}</small>
            </div>
            <div class="form-field">
              <label for="editProjectOriginInput">Origin</label>
              <InputText id="editProjectOriginInput" type="text" v-model="editProjectDialog.origin" :class="{ 'p-invalid': editProjectDialog.error }"/>
            </div>

            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;"/>

            <div class="form-field">
              <label for="editEmailFrequencyInput">Email Frequency</label>
              <Dropdown v-model="editProjectDialog.emailFrequency" :options="emailFrequencyOptions" optionLabel="label" optionValue="value" inputId="editEmailFrequencyInput"/>
            </div>
            <div class="form-field form-checkbox-field">
              <Checkbox v-model="editProjectDialog.excludePrereleases" :binary="true" inputId="excludePrereleases"/>
              <label for="excludePrereleases" class="checkbox-label">Exclude Pre-Releases from notifications</label>
            </div>
            <div class="form-field form-checkbox-field">
              <Checkbox v-model="editProjectDialog.excludeUpdated" :binary="true" inputId="excludeUpdated"/>
              <label for="excludeUpdated" class="checkbox-label">Exclude updated/overridden releases from notifications</label>
            </div>

            <div class="form-field">
              <label>Version Filters</label>
              <div v-for="(filter, index) in editProjectDialog.versionFilters" :key="index" class="filter-row">
                <InputText v-model="filter.value" placeholder="e.g. -beta$ or ^1\.5" class="filter-input"/>
                <SelectButton v-model="filter.inverse" :options="filterModeOptions" optionLabel="label" optionValue="value" class="filter-mode"/>
                <Button icon="pi pi-trash" severity="danger" text @click="removeFilter(index)" class="filter-remove"/>
              </div>
              <Button label="Add Filter" icon="pi pi-plus" severity="secondary" text @click="addFilter()"/>
              <div class="info-note">
                <i class="pi pi-info-circle" style="color: var(--text-color-secondary, #999); margin-right: 4px;"></i>
                <small>Use regex patterns to include or exclude versions. Exclude = suppress matching versions; Include = only notify matching versions. Patterns combine (all includes must match, no exclude may match).</small>
              </div>
            </div>

            <div class="form-field">
              <div class="releases-preview-header">
                <label>Recent Releases Preview</label>
                <Button label="Fetch" icon="pi pi-sync" severity="secondary" size="small" text :loading="editProjectDialog.syncBusy" @click="onSyncProjectReleases()"/>
              </div>
              <div class="releases-preview" v-if="editProjectDialog.releases.length > 0">
                <div v-for="release in filteredReleasesPreview" :key="release.id" class="release-item" :class="{ 'release-excluded': release._excluded }">
                  <span class="release-version">{{ release.version }}</span>
                  <span class="release-date">{{ prettyDate(release.createdAt) }}</span>
                  <i v-if="release._excluded" class="pi pi-ban release-status-icon" style="color: #e6a23c;" v-tooltip.top="'Filtered out'"></i>
                  <i v-else class="pi pi-check-circle release-status-icon" style="color: #67c23a;" v-tooltip.top="'Will be notified'"></i>
                </div>
              </div>
              <div v-else class="releases-preview-empty">
                <small style="color: var(--text-color-secondary, #999);">No releases loaded. Click "Fetch" to sync from the source.</small>
              </div>
            </div>

            <div class="info-note">
              <i class="pi pi-info-circle" style="color: var(--text-color-secondary, #999); margin-right: 4px;"></i>
              <small>Only the 50 most recent versions are tracked. Older releases will not be imported.</small>
            </div>
          </div>
        </form>
        <template #footer>
          <Button label="Cancel" icon="pi pi-times" class="p-button-text" @click="editProjectDialog.visible = false"/>
          <Button label="Save" id="editProjectSubmitButton" :icon="editProjectDialog.busy ? 'pi pi-spin pi-spinner' : 'pi pi-check'" :disabled="!editProjectDialog.name || editProjectDialog.busy" class="p-button-text p-button-success" @click="onEditProjectSubmit()"/>
        </template>
      </Dialog>

      <!-- Settings Dialog -->
      <Dialog header="Settings" v-model:visible="settingsDialog.visible" :dismissableMask="true" :closable="true" :style="{ maxWidth: '100%', width: '728px'}" :modal="true">
        <form @submit="onSettingsSubmit()" @submit.prevent>
          <div>
            <div class="form-field">
              <label for="githubTokenInput">Github Token</label>
              <InputText id="githubTokenInput" type="text" v-model="settingsDialog.githubToken" autofocus :class="{ 'p-invalid': settingsDialog.error }"/>
              <small class="text-error" v-show="settingsDialog.error">{{ settingsDialog.error }}</small>
              <br/>
              <br/>
              <a href="https://github.com/settings/tokens/new?description=NG-Release-Bell&scopes=read:packages" target="_blank" style="margin-top: 10px;">Generate a GitHub API token</a>
              <small style="display: block; margin-top: 4px; color: var(--text-color-secondary, #999);">
                Required for GitHub projects and GitHub Container Registry (GHCR).
                The token must include the <strong>read:packages</strong> scope (Download packages from GitHub Package Registry).
              </small>
            </div>
            <div class="form-field form-checkbox-field">
              <InputSwitch v-model="settingsDialog.githubAutoImport" inputId="githubAutoImport"/>
              <label for="githubAutoImport" class="checkbox-label">Automatically import starred repositories</label>
            </div>
            <div class="info-note">
              <i class="pi pi-info-circle" style="color: var(--text-color-secondary, #999); margin-right: 4px;"></i>
              <small>When enabled, your GitHub starred repos are automatically imported as tracked projects. Disable to manage projects manually only.</small>
            </div>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;"/>
            <div class="form-field">
              <label for="quayTokenInput">Quay Token</label>
              <InputText id="quayTokenInput" type="password" v-model="settingsDialog.quayToken" :class="{ 'p-invalid': settingsDialog.error }"/>
              <small style="display: block; margin-top: 4px; color: var(--text-color-secondary, #999);">Required to retrieve Quay.io projects. Generate a token at Quay.io > Go to User settings > <b>CLI configuration</b> Generate encrypted password > <b>Docker Configuration</b> > Then copy the auth single field and paste it here</small>
            </div>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;"/>
            <div class="form-field">
              <label>Import / Export</label>
              <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <Button label="Export" icon="pi pi-download" severity="secondary" size="small" @click="onExportData()" :loading="settingsDialog.exportBusy"/>
                <Button label="Import" icon="pi pi-upload" severity="secondary" size="small" @click="$refs.importFileInput.click()" :loading="settingsDialog.importBusy"/>
                <input ref="importFileInput" type="file" accept=".json" style="display: none" @change="onImportFile($event)"/>
              </div>
              <small v-if="settingsDialog.importResult" style="display: block; margin-top: 8px; color: var(--text-color-secondary, #999);">{{ settingsDialog.importResult }}</small>
              <small style="display: block; margin-top: 4px; color: var(--text-color-secondary, #999);">Export your tracked projects to a JSON file, or import from a previously exported file. Importing skips duplicates and does not delete existing projects.</small>
            </div>
          </div>
        </form>
        <template #footer>
          <Button label="Cancel" icon="pi pi-times" class="p-button-text" @click="settingsDialog.visible = false"/>
          <Button label="Save" id="settingsSaveButton" :icon="settingsDialog.busy ? 'pi pi-spin pi-spinner' : 'pi pi-check'" :disabled="settingsDialog.busy" class="p-button-text p-button-success" @click="onSettingsSubmit()"/>
        </template>
      </Dialog>
    </template>
    <template #header>
      <TopBar class="navbar">
        <template #left>
          <img src="/favicon.png" style="height: 24px; margin-right: 10px"/> NG Release Bell
        </template>
        <template #center>
          <div style="display: flex; align-items: center; gap: 8px;">
            <InputText v-model="searchQuery" placeholder="Search projects..." class="search-input" @keyup.enter="refresh()"/>
            <Button aria-label="Refresh" text icon="pi pi-refresh" :loading="refreshBusy" @click="refresh()"/>
          </div>
        </template>
        <template #right>
          <Button class="p-button-sm" id="addProjectButton" style="margin-right: 10px" severity="primary" icon="pi pi-plus" label="Add Project" @click="onShowAddProjectDialog()"/>
          <Button class="p-button-sm" id="deleteAllButton" style="margin-right: 10px" severity="danger" icon="pi pi-trash" label="Delete All" @click="onDeleteAllProjects($event)" v-show="projects.length > 0"/>
          <Button class="p-button-sm" id="settingsButton" style="margin-right: 10px" severity="primary" icon="pi pi-cog" label="Settings" @click="onShowSettingsDialog()"/>
          <Button class="p-button-sm" id="logoutButton" severity="secondary" icon="pi pi-sign-out" label="Logout" @click="onLogout()"/>
        </template>
      </TopBar>
    </template>
    <template #body>
      <div style="text-align: center;" v-show="projects.length == 0">
        <img src="/favicon.png" style="width: 64px;"/>
        <h1>Welcome to NG Release Bell</h1>
        <p>Set a GitHub token in your <a href="" @click.prevent="onShowSettingsDialog()">profile</a> to start receiving new release notifcations for your starred repos or add <a href="" @click.prevent="onShowAddProjectDialog()">project URLs</a> for release notifications for those projects.</p>
      </div>
      <DataTable :value="filteredProjects" scrollable scrollHeight="flex" stripedRows style="max-width: 1280px; margin: auto" tableStyle="min-width: 50rem" v-show="projects.length !== 0" class="p-datatable-sm">
        <Column field="name" header="Name" sortable>
          <template #body="slotProps">
            <a :href="getProjectUrl(slotProps.data)" target="_blank">{{ slotProps.data.name }}</a>
          </template>
        </Column>
        <Column field="type" header="Type" sortable>
          <template #body="slotProps">
            <img :src="'/' + slotProps.data.type + '.svg'" class="type-icon" v-show="hasIcon(slotProps.data.type)"/> {{ slotProps.data.type }}
          </template>
        </Column>
        <Column field="version" header="Last Version" sortable>
          <template #body="slotProps">
            <a :href="getVersionUrl(slotProps.data)" target="_blank">{{ slotProps.data.version }}</a>
          </template>
        </Column>
        <Column field="createdAt" header="Released At" sortable>
          <template #body="slotProps">
            {{ prettyDate(slotProps.data.createdAt) }}
          </template>
        </Column>
        <Column field="enabled" header="Track" sortable>
          <template #body="slotProps">
            <InputSwitch v-model="slotProps.data.enabled" @change="onTrackStateChanged(slotProps.data)" />
          </template>
        </Column>
        <Column header="Actions" :exportable="false" style="width: 140px">
          <template #body="slotProps">
            <Button icon="pi pi-pencil" severity="info" text rounded size="small" @click="onShowEditProjectDialog(slotProps.data)" style="margin-right: 4px"/>
            <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="onDeleteProject($event, slotProps.data)"/>
          </template>
        </Column>
      </DataTable>
    </template>
  </MainLayout>
  <ConfirmPopup />
</template>

<script>

import superagent from 'superagent';

import Button from 'primevue/button';
import Dropdown from 'primevue/dropdown';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import InputSwitch from 'primevue/inputswitch';
import ConfirmPopup from 'primevue/confirmpopup';

import MainLayout from 'pankow/components/MainLayout.vue';
import TopBar from 'pankow/components/TopBar.vue';
import BottomBar from 'pankow/components/BottomBar.vue';

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || '';

export default {
  name: 'App',
  components: {
    BottomBar,
    Button,
    Column,
    ConfirmPopup,
    DataTable,
    Dropdown,
    InputSwitch,
    MainLayout,
    TopBar
  },
  data() {
    return {
      busy: true,
      user: null,
      refreshBusy: false,
      projects: [],
      searchQuery: '',
      availableProviders: {},
      loginUrl: `${API_ORIGIN}/api/v1/login?returnTo=${location.origin}`,
      allProjectTypes: [
        { type: 'github_manual', name: 'Github', group: 'Git Hosting' },
        { type: 'gitlab', name: 'GitLab', group: 'Git Hosting' },
        { type: 'gitea', name: 'Codeberg / Gitea', group: 'Git Hosting' },
        { type: 'npm', name: 'NPM', group: 'Registry' },
        { type: 'pypi', name: 'Python PyPI', group: 'Registry' },
        { type: 'dockerhub', name: 'Docker Hub', group: 'Container Registry' },
        { type: 'quay', name: 'Quay', group: 'Container Registry' },
        { type: 'ghcr', name: 'GitHub Container Registry', group: 'Container Registry' },
        { type: 'sourceforge', name: 'SourceForge', group: 'Other' },
      ],
      emailFrequencyOptions: [
        { label: 'Instant emails', value: 'instant' },
        { label: 'Hourly emails', value: 'hourly' },
        { label: 'Daily emails', value: 'daily' },
        { label: 'Weekly emails', value: 'weekly' },
      ],
      filterModeOptions: [
        { label: 'Exclude', value: false },
        { label: 'Include', value: true },
      ],
      addProjectDialog: {
        visible: false,
        busy: false,
        url: '',
        type: { type: 'github_manual', name: 'Github', group: 'Git Hosting' },
        error: '',
      },
      editProjectDialog: {
        visible: false,
        busy: false,
        id: '',
        type: '',
        name: '',
        origin: '',
        error: '',
        emailFrequency: 'instant',
        excludePrereleases: false,
        excludeUpdated: false,
        versionFilters: [],
        releases: [],
        syncBusy: false,
      },
      settingsDialog: {
        visible: false,
        busy: false,
        error: '',
        githubToken: '',
        quayToken: '',
        githubAutoImport: true,
        exportBusy: false,
        importBusy: false,
        importResult: '',
      },
    };
  },
  computed: {
    filteredProjects() {
      if (!this.searchQuery || !this.searchQuery.trim()) return this.projects;
      const q = this.searchQuery.toLowerCase().trim();
      return this.projects.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.type && p.type.toLowerCase().includes(q)) ||
        (p.version && p.version.toLowerCase().includes(q))
      );
    },
    availableProjectTypes() {
      return this.allProjectTypes.map(t => ({
        ...t,
        disabled: !this.isProviderAvailable(t.type)
      }));
    },
    addProjectInputLabel() {
      const t = this.addProjectDialog.type;
      if (!t) return 'URL';
      if (t.type === 'npm' || t.type === 'pypi' || t.type === 'dockerhub' || t.type === 'quay' || t.type === 'ghcr' || t.type === 'sourceforge') {
        return 'Package / Repository Name';
      }
      return 'URL';
    },
    addProjectInputPlaceholder() {
      const t = this.addProjectDialog.type;
      if (!t) return 'https://...';
      if (t.type === 'npm') return 'express';
      if (t.type === 'pypi') return 'requests';
      if (t.type === 'dockerhub') return 'library/nginx';
      if (t.type === 'quay') return 'prometheus/node-exporter';
      if (t.type === 'ghcr') return 'owner/repo';
      if (t.type === 'sourceforge') return 'sevenzip';
      return 'https://github.com/owner/repo';
    },
    filteredReleasesPreview() {
      const filters = this.editProjectDialog.versionFilters;
      const excludePrereleases = this.editProjectDialog.excludePrereleases;
      const hasFilters = filters && filters.some(f => f.value && f.value.trim());
      const includes = filters ? filters.filter(f => f.inverse === true && f.value && f.value.trim()) : [];
      const excludes = filters ? filters.filter(f => f.inverse === false && f.value && f.value.trim()) : [];

      return this.editProjectDialog.releases.map(release => {
        let excluded = false;

        if (excludePrereleases && release.prerelease) {
          excluded = true;
        }

        if (!excluded && hasFilters) {
          const version = release.version;
          let passed = true;

          if (includes.length > 0) {
            passed = includes.some(f => {
              try { return new RegExp(f.value).test(version); }
              catch (e) { return false; }
            });
          }

          if (passed && excludes.length > 0) {
            passed = !excludes.some(f => {
              try { return new RegExp(f.value).test(version); }
              catch (e) { return false; }
            });
          }

          if (!passed) excluded = true;
        }

        return { ...release, _excluded: excluded };
      });
    },
  },
  methods: {
    isProviderAvailable(type) {
      if (type === 'quay') return !!this.availableProviders.quay;
      if (type === 'ghcr') return !!this.availableProviders.ghcr;
      return true;
    },
    hasIcon(type) {
      const iconTypes = ['github', 'github_manual', 'gitlab', 'gitea'];
      return iconTypes.indexOf(type) !== -1;
    },
    getProjectUrl(project) {
      if (project.type === 'github' || project.type === 'github_manual') return `https://github.com/${project.name}`;
      if (project.type === 'gitlab') return `${project.origin}/${project.name}`;
      if (project.type === 'gitea') return `${project.origin}/${project.name}`;
      if (project.type === 'npm') return `https://www.npmjs.com/package/${project.name}`;
      if (project.type === 'pypi') return `https://pypi.org/project/${project.name}/`;
      if (project.type === 'dockerhub') return `https://hub.docker.com/r/${project.name}`;
      if (project.type === 'quay') return `https://quay.io/repository/${project.name}`;
      if (project.type === 'ghcr') return `https://github.com/${project.name.split('/')[0]}?tab=packages`;
      if (project.type === 'sourceforge') return `https://sourceforge.net/projects/${project.name}/`;
      return '#';
    },
    getVersionUrl(project) {
      if (!project.version) return '#';
      if (project.type === 'github' || project.type === 'github_manual') return `https://github.com/${project.name}/releases/tag/${project.version}`;
      if (project.type === 'gitlab') return `${project.origin}/${project.name}/-/tags/${project.version}`;
      if (project.type === 'gitea') return `${project.origin}/${project.name}/releases/tag/${project.version}`;
      if (project.type === 'npm') return `https://www.npmjs.com/package/${project.name}/v/${project.version}`;
      if (project.type === 'pypi') return `https://pypi.org/project/${project.name}/${project.version}/`;
      if (project.type === 'dockerhub') return `https://hub.docker.com/r/${project.name}/tags?name=${project.version}`;
      if (project.type === 'quay') return `https://quay.io/repository/${project.name}`;
      if (project.type === 'sourceforge') return `https://sourceforge.net/projects/${project.name}/files/${project.version}/`;
      return '#';
    },
    prettyDate: function (value) {
      if (!value) return '';

      var date = new Date(value),
      diff = (((new Date()).getTime() - date.getTime()) / 1000),
      day_diff = Math.floor(diff / 86400);

      if (isNaN(day_diff) || day_diff < 0) return;

      return day_diff === 0 && (
        diff < 60 && 'just now' ||
        diff < 120 && '1 minute ago' ||
        diff < 3600 && Math.floor( diff / 60 ) + ' minutes ago' ||
        diff < 7200 && '1 hour ago' ||
        diff < 86400 && Math.floor( diff / 3600 ) + ' hours ago') ||
        day_diff === 1 && 'Yesterday' ||
        day_diff < 7 && day_diff + ' days ago' ||
        day_diff < 31 && Math.ceil( day_diff / 7 ) + ' weeks ago' ||
        day_diff < 365 && Math.round( day_diff / 30 ) +  ' months ago' ||
        Math.round( day_diff / 365 ) + ' years ago';
    },
    async onTrackStateChanged(project) {
      await superagent.post(`${API_ORIGIN}/api/v1/projects/${project.id}`).send({ enabled: project.enabled });
    },
    async onLogout() {
      await superagent.get(`${API_ORIGIN}/api/v1/logout?return_to=${location.origin}`);
      this.user = null;
    },
    async refresh() {
      this.refreshBusy = true;
      const result = await superagent.get(`${API_ORIGIN}/api/v1/projects`);
      this.refreshBusy = false;

      this.projects = result.body.projects;
    },
    async loadProviders() {
      try {
        const result = await superagent.get(`${API_ORIGIN}/api/v1/providers`);
        this.availableProviders = result.body.providers;
      } catch (e) {
        console.error('Failed to load providers', e);
      }
    },
    addFilter() {
      this.editProjectDialog.versionFilters.push({ value: '', inverse: false });
    },
    removeFilter(index) {
      this.editProjectDialog.versionFilters.splice(index, 1);
    },
    onShowAddProjectDialog() {
      this.addProjectDialog.url = '';
      this.addProjectDialog.type = this.availableProjectTypes.find(t => !t.disabled) || this.allProjectTypes[0];
      this.addProjectDialog.error = '';
      this.addProjectDialog.visible = true;
    },
    async onShowEditProjectDialog(project) {
      const match = this.availableProjectTypes.find(t => t.type === project.type);
      this.editProjectDialog.id = project.id;
      this.editProjectDialog.type = match || this.availableProjectTypes[0];
      this.editProjectDialog.name = project.name;
      this.editProjectDialog.origin = project.origin || '';
      this.editProjectDialog.emailFrequency = project.emailFrequency || 'instant';
      this.editProjectDialog.excludePrereleases = !!project.excludePrereleases;
      this.editProjectDialog.excludeUpdated = !!project.excludeUpdated;
      this.editProjectDialog.versionFilters = project.versionFilters ? (typeof project.versionFilters === 'string' ? JSON.parse(project.versionFilters) : project.versionFilters) : [];
      this.editProjectDialog.releases = [];
      this.editProjectDialog.error = '';
      this.editProjectDialog.visible = true;

      try {
        const result = await superagent.get(`${API_ORIGIN}/api/v1/projects/${project.id}/releases`);
        this.editProjectDialog.releases = result.body.releases;
      } catch (e) {
        console.error('Failed to load releases for preview', e);
      }
    },
    async onSyncProjectReleases() {
      this.editProjectDialog.syncBusy = true;
      try {
        await superagent.post(`${API_ORIGIN}/api/v1/projects/${this.editProjectDialog.id}/sync`);
        const result = await superagent.get(`${API_ORIGIN}/api/v1/projects/${this.editProjectDialog.id}/releases`);
        this.editProjectDialog.releases = result.body.releases;
      } catch (e) {
        console.error('Failed to sync releases', e);
      }
      this.editProjectDialog.syncBusy = false;
    },
    async onEditProjectSubmit() {
      if (!this.editProjectDialog.name) return;

      const data = {
        type: this.editProjectDialog.type.type,
        name: this.editProjectDialog.name,
        origin: this.editProjectDialog.origin || '',
        emailFrequency: this.editProjectDialog.emailFrequency,
        excludePrereleases: this.editProjectDialog.excludePrereleases,
        excludeUpdated: this.editProjectDialog.excludeUpdated,
        versionFilters: JSON.stringify(this.editProjectDialog.versionFilters),
      };

      this.editProjectDialog.busy = true;
      try {
        await superagent.post(`${API_ORIGIN}/api/v1/projects/${this.editProjectDialog.id}`).send(data);
      } catch (error) {
        this.editProjectDialog.error = (error.response && error.response.text) || error.message || 'Failed to update project';
        this.editProjectDialog.busy = false;
        return;
      }
      this.editProjectDialog.busy = false;
      this.editProjectDialog.visible = false;

      await this.refresh();
    },
    async onDeleteProject(event, project) {
      try {
        await superagent.delete(`${API_ORIGIN}/api/v1/projects/${project.id}`);
      } catch (error) {
        console.error('Failed to delete project', error);
        return;
      }
      await this.refresh();
    },
    onDeleteAllProjects(event) {
      this.$confirm.require({
        target: event.currentTarget,
        message: 'Delete all tracked projects? This cannot be undone.',
        icon: 'pi pi-exclamation-triangle',
        acceptClass: 'p-button-danger',
        accept: async () => {
          for (const project of this.projects) {
            try {
              await superagent.delete(`${API_ORIGIN}/api/v1/projects/${project.id}`);
            } catch (error) {
              console.error('Failed to delete project', project.name, error);
            }
          }
          await this.refresh();
        },
      });
    },
    onShowSettingsDialog() {
      this.settingsDialog.githubToken = this.user.githubToken || '';
      this.settingsDialog.quayToken = this.quayToken || '';
      this.settingsDialog.githubAutoImport = this.user.githubAutoImport === true || this.user.githubAutoImport === 1 || this.user.githubAutoImport === undefined;
      this.settingsDialog.error = '';
      this.settingsDialog.visible = true;
    },
    async onAddProjectSubmit() {
      const selectedType = this.addProjectDialog.type.type;
      let data;

      const isRegistry = ['npm', 'pypi', 'dockerhub', 'quay', 'ghcr', 'sourceforge'].indexOf(selectedType) !== -1;

      if (isRegistry) {
        data = {
          type: selectedType,
          name: this.addProjectDialog.url.trim(),
        };
      } else {
        let url;
        try {
          url = new URL(this.addProjectDialog.url);
        } catch (e) {
          this.addProjectDialog.error = 'Invalid URL';
          return;
        }

        const components = url.pathname.split('/').filter(Boolean);
        if (components.length < 2) {
          this.addProjectDialog.error = 'Invalid project URL';
          return;
        }

        data = {
          type: selectedType,
          name: components[0] + '/' + components[1],
          origin: url.origin
        };
      }

      this.addProjectDialog.busy = true;
      this.addProjectDialog.error = '';
      try {
        await superagent.post(`${API_ORIGIN}/api/v1/projects/`).send(data);
      } catch (error) {
        this.addProjectDialog.error = (error.response && error.response.text) || error.message || 'Failed to add project';
        this.addProjectDialog.busy = false;
        return;
      }
      this.addProjectDialog.visible = false;
      this.addProjectDialog.busy = false;

      await this.refresh();
    },
    async onSettingsSubmit() {
      this.settingsDialog.busy = true;
      this.settingsDialog.error = '';

      const currentAutoImport = this.user.githubAutoImport === true || this.user.githubAutoImport === 1 || this.user.githubAutoImport === undefined;

      try {
        const body = {};
        if (this.settingsDialog.githubToken !== (this.user.githubToken || '')) {
          body.githubToken = this.settingsDialog.githubToken;
        }
        if (this.settingsDialog.quayToken) {
          body.quayToken = this.settingsDialog.quayToken;
        }
        if (this.settingsDialog.githubAutoImport !== currentAutoImport) {
          body.githubAutoImport = this.settingsDialog.githubAutoImport;
        }
        if (Object.keys(body).length > 0) {
          await superagent.post(`${API_ORIGIN}/api/v1/profile`).send(body);
          this.user.githubAutoImport = this.settingsDialog.githubAutoImport;
        }
      } catch (error) {
        if (error.status === 402) {
          document.getElementById('githubTokenInput').focus();
          this.settingsDialog.error = 'Invalid GitHub token provided';
        } else {
          console.error('Unexpected error saving profile', error);
        }

        this.settingsDialog.busy = false;
        return;
      }

      this.settingsDialog.busy = false;
      this.settingsDialog.visible = false;
    },
    async onExportData() {
      this.settingsDialog.exportBusy = true;
      try {
        const result = await superagent.get(`${API_ORIGIN}/api/v1/data/export`);
        const blob = new Blob([JSON.stringify(result.body, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ng-release-bell-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Export failed', error);
      }
      this.settingsDialog.exportBusy = false;
    },
    onImportFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      this.settingsDialog.importBusy = true;
      this.settingsDialog.importResult = '';
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const result = await superagent.post(`${API_ORIGIN}/api/v1/data/import`).send(data);
          this.settingsDialog.importResult = `Imported ${result.body.imported} project(s), skipped ${result.body.skipped} duplicate(s).`;
          await this.refresh();
        } catch (error) {
          this.settingsDialog.importResult = `Import failed: ${error.message}`;
          console.error('Import failed', error);
        }
        this.settingsDialog.importBusy = false;
        event.target.value = '';
      };
      reader.readAsText(file);
    }
  },
  async mounted() {
    this.busy = true;

    try {
      const result = await superagent.get(`${API_ORIGIN}/api/v1/profile`);
      this.user = result.body.user;
      this.quayToken = result.body.user.quayToken || '';

      await Promise.all([this.refresh(), this.loadProviders()]);
    } catch (e) {
      if (e.status !== 401) console.error(e);
    }

    this.busy = false;
  }
};

</script>

<style scoped>

.login-container {
  max-width: 480px;
  margin: auto;
  padding: 20px;
  text-align: center;
  margin-top: 50px;
  background-color: white;
  box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.login-container img {
  max-height: 128px;
}

.login-container h1 {
  font-size: 30px;
  font-weight: normal;
}

.form-field {
  margin-top: 10px;
  margin-bottom: 10px;
}

.form-field > label {
  display: block;
  margin-bottom: 10px;
}

.form-field > * {
  width: 100%;
}

.form-checkbox-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-checkbox-field > .p-inputswitch,
.form-checkbox-field > .p-checkbox {
  flex-shrink: 0;
  width: auto;
}

.form-checkbox-field > .p-inputswitch {
  width: 3.25rem;
}

.form-checkbox-field > label {
  width: auto;
  margin-bottom: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.info-note {
  margin-top: 10px;
  margin-bottom: 10px;
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.filter-input {
  flex: 1;
}

.filter-mode {
  flex-shrink: 0;
}

.filter-mode .p-button {
  padding: 0.4rem 0.75rem;
}

.filter-remove {
  flex-shrink: 0;
  width: auto !important;
}

.releases-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.releases-preview-header > label {
  margin-bottom: 0;
}

.releases-preview-empty {
  padding: 16px;
  text-align: center;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

.releases-preview {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 4px;
}

.release-item {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid #f0f0f0;
  gap: 8px;
}

.release-item:last-child {
  border-bottom: none;
}

.release-excluded {
  opacity: 0.5;
}

.release-excluded .release-version {
  text-decoration: line-through;
}

.release-version {
  font-weight: 500;
  flex: 1;
}

.release-date {
  color: #909399;
  font-size: 12px;
}

.release-status-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.type-icon {
  height: 24px;
  vertical-align: middle;
  padding-right: 10px;
  filter: grayscale(0.5);
}

hr {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 20px 0;
}

.search-input {
  width: 240px;
}

</style>