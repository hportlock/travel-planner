import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Home from './pages/Home';
import Login from './pages/Login';
import ShareView from './pages/ShareView';
import TripEdit from './pages/TripEdit';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/t/:shareToken" element={<ShareView />} />
        <Route path="/trip/:id" element={<TripEdit />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
