import { render } from 'preact';
import { App } from './App';
import '../common/theme.css';
import '../common/branches/branches.css';
import './branches.css';

const root = document.getElementById('root')!;
render(<App />, root);
