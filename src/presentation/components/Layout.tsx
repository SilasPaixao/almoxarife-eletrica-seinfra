import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { 
  Users, 
  Package, 
  ClipboardList, 
  FileText, 
  LogOut, 
  Menu, 
  X, 
  Home,
  CheckCircle,
  Clock
} from 'lucide-react';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  const menuItems = user?.role === 'ADMIN' ? [
    { name: 'Início', path: '/', icon: Home },
    { name: 'Demandas', path: '/admin/demands', icon: ClipboardList },
    { name: 'Materiais', path: '/admin/materials', icon: Package },
    { name: 'Usuários', path: '/admin/users', icon: Users },
    { name: 'Relatórios', path: '/admin/reports', icon: FileText },
  ] : [
    { name: 'Minhas Demandas', path: '/', icon: ClipboardList },
  ];

  const activeItem = menuItems.find(item => item.path === location.pathname);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ 
              backgroundImage: 'url(https://i.postimg.cc/PrrM4HxN/Serrinha-Image.png)',
              filter: 'blur(8px) brightness(0.5)'
            }}
          />
          <div 
            className="absolute inset-0 bg-blue-900/40 backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
        </div>
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 z-50 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col">
          <div className="p-6">
            <img src="https://i.postimg.cc/W3n0DdqH/pref-logo-sha.png" alt="Logo" className="h-12 mx-auto mb-2" />
            <div className="text-center">
              <p className="font-bold text-gray-800 text-sm">SEINFRA ELÉTRICA</p>
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors
                    ${location.pathname === item.path 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                  `}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center p-2 mb-4">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                  {user?.name.charAt(0)}
                </div>
              </div>
              <div className="ml-3 overflow-hidden">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                <p className="text-xs text-gray-500 truncate">{user?.role === 'ELECTRICIAN' ? 'ELETRICISTA' : user?.role}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-gray-200 lg:hidden">
          <div className="px-4 py-4 flex items-center justify-between">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="text-gray-500 hover:text-gray-700"
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">
              {activeItem?.name || 'Início'}
            </h1>
            <div className="w-6" /> {/* Spacer */}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
