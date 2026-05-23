import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import LandingPage from './pages/LandingPage';
import UserInterface from './pages/UserInterface';
import AdminInterface from './pages/AdminInterface';

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        {/* Landing Page */}
        <Route path="/" element={<LandingPage />} />

        {/* Civilian Reporting Interface */}
        <Route path="/user" element={<UserInterface />} />
        
        {/* Admin Dashboard Interface */}
        <Route path="/admin" element={<AdminInterface />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
