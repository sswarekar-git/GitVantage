import { render } from 'preact';
import { App } from './App';
import '../common/theme.css';
import '../common/branches/branches.css';
import './log.css';

const root = document.getElementById('root')!;
render(<App />, root);
