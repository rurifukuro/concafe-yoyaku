import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import { CustomerPage } from './pages/CustomerPage';
import { AdminPage } from './pages/AdminPage';

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <nav className="app-nav">
          <Link to="/">予約</Link>
          <Link to="/admin">管理</Link>
        </nav>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<CustomerPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
