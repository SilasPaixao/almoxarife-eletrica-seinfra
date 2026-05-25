import { useAuth } from '../context/AuthContext.tsx';
import Layout from '../components/Layout.tsx';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../services/api.ts';
import { ClipboardList, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ptBR } from 'date-fns/locale';
import { parseUTCDate, formatLocalDate } from '../utils/date.ts';

export default function Dashboard() {
  const { user } = useAuth();
  
  const { data: demands, isLoading } = useQuery({
    queryKey: ['demands'],
    queryFn: async () => {
      const resp = await api.get('/demands');
      return resp.data;
    }
  });

  const [activeTab, setActiveTab] = useState<'PENDING' | 'PENDING_APPROVAL' | 'CONCLUDED'>('PENDING');

  const currentYear = new Date().getFullYear();
  const yearDemands = demands?.filter((d: any) => {
    if (!d.date) return false;
    return parseUTCDate(d.date).getFullYear() === currentYear;
  });

  const stats = [
    { name: 'Pendentes', value: yearDemands?.filter((d: any) => d.status === 'PENDING').length || 0, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100' },
    { name: 'Em Aprovação', value: yearDemands?.filter((d: any) => d.status === 'PENDING_APPROVAL').length || 0, icon: AlertTriangle, color: 'text-blue-600', bg: 'bg-blue-100' },
    { name: 'Executadas', value: yearDemands?.filter((d: any) => d.status === 'CONCLUDED').length || 0, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' },
  ];

  const filteredDemands = yearDemands?.filter((d: any) => {
    return d.status === activeTab;
  });

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Olá, {user?.name}</h1>
        <p className="text-gray-600">Bem-vindo ao sistema de gestão do almoxarifado.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
            <div className={`p-3 rounded-lg ${stat.bg} ${stat.color} mr-4`}>
              <stat.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase">{stat.name}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => setActiveTab('PENDING')}
              className={`pb-1 text-lg font-bold transition-colors ${
                activeTab === 'PENDING' ? 'border-b-2 border-yellow-500 text-yellow-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Pendentes
            </button>
            <button
              onClick={() => setActiveTab('PENDING_APPROVAL')}
              className={`pb-1 text-lg font-bold transition-colors ${
                activeTab === 'PENDING_APPROVAL' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Em Aprovação
            </button>
            <button
              onClick={() => setActiveTab('CONCLUDED')}
              className={`pb-1 text-lg font-bold transition-colors ${
                activeTab === 'CONCLUDED' ? 'border-b-2 border-green-600 text-green-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Executadas
            </button>
          </div>
          <Link to={user?.role === 'ADMIN' ? '/admin/demands' : '/'} className="text-blue-600 text-sm font-medium hover:underline">
            Ver tudo
          </Link>
        </div>
        
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Carregando demandas...</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredDemands?.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Nenhuma demanda encontrada nesta categoria.</div>
            ) : (
              filteredDemands?.map((demand: any) => (
                <Link 
                  key={demand.id} 
                  to={`/demands/${demand.id}`}
                  className="block p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-gray-900">{demand.location}</h3>
                      <p className="text-gray-600 text-sm line-clamp-1">{demand.description}</p>
                      <div className="flex items-center mt-2 text-xs text-gray-500 space-x-4">
                        <span className="flex items-center">
                          <ClipboardList className="h-3 w-3 mr-1" />
                          {formatLocalDate(demand.date, "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                        {user?.role === 'ADMIN' && (
                          <div className="flex gap-1">
                            {demand.electricians && demand.electricians.length > 0 ? (
                              demand.electricians.map((e: any) => (
                                <span key={e.id} className="bg-gray-100 px-2 py-0.5 rounded uppercase text-[10px]">{e.name}</span>
                              ))
                            ) : (
                               <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded uppercase text-[10px] font-bold border border-red-100 animate-pulse">Não atribuída!</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center">
                      <StatusBadge status={demand.status} />
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: any = {
    PENDING: { color: 'bg-yellow-100 text-yellow-800', label: 'Pendente' },
    PENDING_APPROVAL: { color: 'bg-blue-100 text-blue-800', label: 'Em Aprovação' },
    CONCLUDED: { color: 'bg-green-100 text-green-800', label: 'Executada' },
  };

  const config = configs[status] || { color: 'bg-gray-100 text-gray-800', label: status };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${config.color}`}>
      {config.label}
    </span>
  );
}
