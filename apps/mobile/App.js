import React from 'react';
import Launcher from '../../packages/ui/Launcher';
import {api,initialState} from './platform-api';
export default function App(){return <Launcher api={api} initialState={initialState}/>;}
