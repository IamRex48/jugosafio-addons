import React from 'react';
import {createRoot} from 'react-dom/client';
import Launcher from '../../../../packages/ui/Launcher';
const {initialState}=require('../../../../packages/ui/initial-state');
if(!window.fonyx)throw new Error('The desktop IPC adapter is unavailable.');
createRoot(document.getElementById('root')).render(<Launcher api={window.fonyx} initialState={initialState}/>);
