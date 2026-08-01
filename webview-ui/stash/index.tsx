import { render } from 'preact';
import { App } from './App';
import '../common/theme.css';
import './stash.css';

const root = document.getElementById('root')!;
render(<App />, root);
