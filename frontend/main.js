import { createApp } from 'vue';

import PrimeVue from 'primevue/config';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import SelectButton from 'primevue/selectbutton';
import Tooltip from 'primevue/tooltip';
import ConfirmationService from 'primevue/confirmationservice';
import ConfirmPopup from 'primevue/confirmpopup';

import 'primevue/resources/themes/saga-blue/theme.css';
import 'primevue/resources/primevue.min.css';
import 'primeicons/primeicons.css';

import './style.css';

import App from './App.vue';

const app = createApp(App);

app.use(PrimeVue);
app.use(ConfirmationService);

app.component('Dialog', Dialog);
app.component('InputText', InputText);
app.component('Checkbox', Checkbox);
app.component('SelectButton', SelectButton);
app.component('ConfirmPopup', ConfirmPopup);

app.directive('tooltip', Tooltip);

app.mount('#app');