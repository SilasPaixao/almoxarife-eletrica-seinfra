import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.tsx';
import api from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { 
  ArrowLeft, 
  MapPin, 
  Calendar, 
  User, 
  Package, 
  CheckCircle, 
  Camera, 
  Loader2, 
  AlertCircle,
  Truck,
  Info,
  Pencil,
  Plus,
  Trash2,
  Search,
  ClipboardList
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Modal from '../components/Modal.tsx';

export default function DemandDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [usedMaterials, setUsedMaterials] = useState<any[]>([]);
  const [replacedMaterials, setReplacedMaterials] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<string[]>([]);
  const [trafo, setTrafo] = useState('');
  const [obs, setObs] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    date: '',
    location: '',
    description: '',
    clientNumber: '',
    electricianId: '',
    materials: [] as { materialId: string; quantity: number }[]
  });
  const [materialSearch, setMaterialSearch] = useState('');
  const [showMaterialResults, setShowMaterialResults] = useState(false);

  const { data: demand, isLoading } = useQuery({
    queryKey: ['demand', id],
    queryFn: async () => (await api.get(`/demands`)).data.find((d: any) => d.id === id),
  });

  const { data: materials } = useQuery({
    queryKey: ['materials'],
    queryFn: async () => (await api.get('/materials')).data,
  });

  const { data: electricians } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const resp = await api.get('/users');
      return resp.data.filter((u: any) => u.role === 'ELECTRICIAN' && u.status === 'APPROVED');
    }
  });

  const filteredMaterials = materials?.filter((m: any) => 
    m.name.toLowerCase().includes(materialSearch.toLowerCase())
  );

  const updateMutation = useMutation({
    mutationFn: async (data: any) => await api.put(`/demands/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      queryClient.invalidateQueries({ queryKey: ['demand', id] });
      setIsEditModalOpen(false);
      setFeedback({ type: 'success', message: 'Demanda atualizada com sucesso!' });
      setTimeout(() => setFeedback(null), 3000);
    },
  });

  const finishMutation = useMutation({
    mutationFn: async (data: FormData) => await api.post(`/demands/${id}/finish`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      queryClient.invalidateQueries({ queryKey: ['demand', id] });
      setFeedback({ type: 'success', message: 'Demanda enviada para aprovação do administrador!' });
      setTimeout(() => navigate('/'), 2000);
    },
    onError: (error: any) => {
      console.error('Error finishing demand:', error);
      setFeedback({ 
        type: 'error', 
        message: error.response?.data?.error || 'Erro ao finalizar serviço. Verifique se preencheu todos os campos e a foto.' 
      });
      setTimeout(() => setFeedback(null), 5000);
    }
  });

  const approveMutation = useMutation({
    mutationFn: async () => await api.patch(`/demands/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      queryClient.invalidateQueries({ queryKey: ['demand', id] });
      setFeedback({ type: 'success', message: 'Serviço aprovado e registrado no relatório!' });
      setTimeout(() => setFeedback(null), 3000);
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: 'Erro ao aprovar serviço.' });
      setTimeout(() => setFeedback(null), 5000);
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleAddUsedMaterial = (matId: string) => {
    if (!matId) return;
    if (usedMaterials.find(m => m.materialId === matId)) return;
    setUsedMaterials([...usedMaterials, { materialId: matId, quantity: 1 }]);
  };

  const handleAddReplacedMaterial = (matId: string) => {
    if (!matId) return;
    if (replacedMaterials.find(m => m.materialId === matId)) return;
    setReplacedMaterials([...replacedMaterials, { materialId: matId, quantity: 1 }]);
  };

  const handleVehicleToggle = (v: string) => {
    setVehicles(prev => prev.includes(v) ? prev.filter(item => item !== v) : [...prev, v]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) {
      setFeedback({ type: 'error', message: 'A foto do serviço é obrigatória!' });
      return;
    }
    if (usedMaterials.length === 0) {
      setFeedback({ type: 'error', message: 'É necessário informar os materiais utilizados!' });
      return;
    }
    if (vehicles.length === 0) {
      setFeedback({ type: 'error', message: 'Informe o veículo/equipamento utilizado!' });
      return;
    }

    const formData = new FormData();
    formData.append('photo', photo);
    formData.append('usedMaterials', JSON.stringify(usedMaterials));
    formData.append('replacedMaterials', JSON.stringify(replacedMaterials));
    formData.append('vehicles', vehicles.join(','));
    formData.append('transformerNumber', trafo);
    formData.append('observation', obs);

    finishMutation.mutate(formData);
  };

  const handleEditClick = () => {
    if (!demand) return;
    setEditFormData({
      date: format(new Date(demand.date), 'yyyy-MM-dd'),
      location: demand.location,
      description: demand.description,
      clientNumber: demand.clientNumber || '',
      electricianId: demand.electricianId,
      materials: demand.plannedMaterials?.map((pm: any) => ({
        materialId: pm.materialId,
        quantity: pm.quantity
      })) || []
    });
    setIsEditModalOpen(true);
  };

  const handleAddMaterial = (materialId: string) => {
    if (!materialId) return;
    if (editFormData.materials.find(m => m.materialId === materialId)) return;
    setEditFormData({
      ...editFormData,
      materials: [...editFormData.materials, { materialId, quantity: 1 }]
    });
  };

  const updateMaterialQty = (materialId: string, quantity: number) => {
    setEditFormData({
      ...editFormData,
      materials: editFormData.materials.map(m => m.materialId === materialId ? { ...m, quantity } : m)
    });
  };

  const removeMaterial = (materialId: string) => {
    setEditFormData({
      ...editFormData,
      materials: editFormData.materials.filter(m => m.materialId !== materialId)
    });
  };

  if (isLoading) return <Layout><div className="text-center py-20">Carregando...</div></Layout>;
  if (!demand) return <Layout><div className="text-center py-20">Demanda não encontrada.</div></Layout>;

  const isElectrician = user?.role === 'ELECTRICIAN';
  const isDone = demand.status === 'PENDING_APPROVAL' || demand.status === 'CONCLUDED';

  return (
    <Layout>
      {/* Feedback Message */}
      {feedback && (
        <div className={`fixed top-4 right-4 z-[100] p-4 rounded-lg shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
          feedback.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {feedback.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <span className="font-medium">{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="ml-2 hover:opacity-70"><Plus className="h-4 w-4 rotate-45" /></button>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-5 w-5 mr-1" /> Voltar
        </button>
        <StatusBadge status={demand.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Detail Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4">{demand.location}</h2>
            
            <div className="space-y-4">
              <div className="flex items-start">
                <Calendar className="h-5 w-5 text-blue-500 mr-3 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500 uppercase font-bold">Data</p>
                  <p className="text-sm text-gray-900 font-medium">{format(new Date(demand.date), 'dd/MM/yyyy')}</p>
                </div>
              </div>
              <div className="flex items-start">
                <Info className="h-5 w-5 text-blue-500 mr-3 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500 uppercase font-bold">Descrição</p>
                  <p className="text-sm text-gray-900 leading-relaxed">{demand.description}</p>
                </div>
              </div>
              {demand.clientNumber && (
                <div className="flex items-start">
                  <User className="h-5 w-5 text-blue-500 mr-3 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-bold">Contato do Solicitante</p>
                    <p className="text-sm text-gray-900 font-medium">{demand.clientNumber}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 border-t pt-6">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center uppercase">
                <Package className="h-4 w-4 mr-2" /> Materiais Planejados
              </h3>
              <ul className="space-y-2">
                {demand.plannedMaterials?.map((m: any) => (
                  <li key={m.id} className="text-sm text-gray-600 flex justify-between bg-gray-50 p-2 rounded">
                    <span>{m.material.name}</span>
                    <span className="font-bold">{m.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {isDone && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase">Foto do Serviço</h3>
              <img src={demand.photoUrl} alt="Serviço concluído" className="w-full rounded-xl shadow-inner border border-gray-100" />
            </div>
          )}
        </div>

        {/* Action Form / Completion Summary */}
        <div className="lg:col-span-2">
          {!isDone && isElectrician ? (
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-8">
              <h2 className="text-2xl font-bold text-gray-900 border-b pb-4">Concluir Serviço</h2>
              
              {/* Photo Upload */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-4">Foto do Serviço (Obrigatório)</label>
                <div 
                  className="w-full h-64 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-all overflow-hidden relative"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Camera className="h-12 w-12 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500">Toque para tirar foto ou selecionar arquivo</p>
                    </>
                  )}
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />
                </div>
              </div>

              {/* Used Materials */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-4">Materiais Utilizados (Obrigatório)</label>
                <select 
                  className="w-full p-3 border border-gray-300 rounded-xl mb-4 bg-gray-50"
                  onChange={(e) => handleAddUsedMaterial(e.target.value)}
                  value=""
                >
                  <option value="">Adicionar Material Utilizado...</option>
                  {materials?.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <div className="space-y-2">
                  {usedMaterials.map(m => {
                    const material = materials?.find((mat: any) => mat.id === m.materialId);
                    return (
                      <div key={m.materialId} className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <span className="text-sm font-medium">{material?.name}</span>
                        <input 
                          type="number" 
                          min="1" 
                          className="w-20 p-2 border border-blue-200 rounded-lg text-center"
                          value={m.quantity}
                          onChange={(e) => setUsedMaterials(prev => prev.map(item => item.materialId === m.materialId ? { ...item, quantity: parseInt(e.target.value) } : item))}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Replaced Materials */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Materiais Retornados / Defeituosos</label>
                <p className="text-xs text-gray-500 mb-4">Informe o que foi removido/substituído.</p>
                <select 
                  className="w-full p-3 border border-gray-300 rounded-xl mb-4 bg-gray-50"
                  onChange={(e) => handleAddReplacedMaterial(e.target.value)}
                  value=""
                >
                  <option value="">Adicionar Material Substituído...</option>
                  {materials?.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <div className="space-y-2">
                  {replacedMaterials.map(m => {
                    const material = materials?.find((mat: any) => mat.id === m.materialId);
                    return (
                      <div key={m.materialId} className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100">
                        <span className="text-sm font-medium">{material?.name}</span>
                        <input 
                          type="number" 
                          min="1" 
                          className="w-20 p-2 border border-red-200 rounded-lg text-center"
                          value={m.quantity}
                          onChange={(e) => setReplacedMaterials(prev => prev.map(item => item.materialId === m.materialId ? { ...item, quantity: parseInt(e.target.value) } : item))}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Vehicles */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-4">Veículo / Equipamento (Obrigatório)</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {['Fiat Strada', 'Caminhão Munck', 'Caminhão Cesto', 'Escada', 'Gerador'].map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleVehicleToggle(v)}
                      className={`
                        p-3 rounded-xl border-2 text-sm font-medium transition-all flex items-center justify-center
                        ${vehicles.includes(v) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-300'}
                      `}
                    >
                      <Truck className={`h-4 w-4 mr-2 ${vehicles.includes(v) ? 'text-white' : 'text-gray-400'}`} />
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Extra Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Número do Trafo</label>
                  <input 
                    type="text" 
                    className="w-full p-3 border border-gray-300 rounded-xl"
                    placeholder="Opcional"
                    value={trafo}
                    onChange={e => setTrafo(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Observação</label>
                  <textarea 
                    className="w-full p-3 border border-gray-300 rounded-xl"
                    placeholder="Opcional"
                    rows={1}
                    value={obs}
                    onChange={e => setObs(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={finishMutation.isPending}
                className="w-full bg-green-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-green-700 flex items-center justify-center disabled:opacity-50"
              >
                {finishMutation.isPending ? <Loader2 className="animate-spin h-6 w-6" /> : (
                  <>
                    <CheckCircle className="h-6 w-6 mr-2" /> FINALIZAR SERVIÇO
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-8">
              <div className="flex justify-between items-center border-b pb-4">
                <h2 className="text-2xl font-bold text-gray-900">Resumo da Execução</h2>
                {user?.role === 'ADMIN' && demand.status === 'PENDING_APPROVAL' && (
                  <button 
                    onClick={() => approveMutation.mutate()}
                    className="bg-purple-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-purple-700 flex items-center"
                  >
                    <CheckCircle className="h-5 w-5 mr-2" /> APROVAR CONCLUSÃO
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase">Materiais Utilizados</h3>
                  <div className="space-y-2">
                    {demand.usedMaterials?.map((m: any) => (
                      <div key={m.id} className="flex justify-between p-3 bg-blue-50 rounded-xl border border-blue-100 text-sm">
                        <span className="font-medium">{m.material.name}</span>
                        <span className="font-bold">{m.quantity}</span>
                      </div>
                    ))}
                    {demand.usedMaterials?.length === 0 && <p className="text-gray-500 text-sm italic">Nenhum material utilizado.</p>}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase">Relatório de Retorno</h3>
                  <div className="space-y-2">
                    {demand.returnedMaterials?.map((m: any) => (
                      <div key={m.id} className={`flex justify-between p-3 rounded-xl border text-sm ${m.type === 'DEFECTIVE' ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex flex-col">
                          <span className="font-medium">{m.material.name}</span>
                          <span className="text-[10px] uppercase font-bold text-gray-400">{m.type === 'DEFECTIVE' ? 'Substituído' : 'Não Utilizado'}</span>
                        </div>
                        <span className="font-bold flex items-center">{m.quantity}</span>
                      </div>
                    ))}
                    {demand.returnedMaterials?.length === 0 && <p className="text-gray-500 text-sm italic">Nenhum material retornado.</p>}
                  </div>
                </div>
              </div>

              <div className="border-t pt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase">Veículos Utilizados</h3>
                  <div className="flex flex-wrap gap-2">
                    {demand.vehicles?.map((v: string) => (
                      <span key={v} className="px-3 py-1 bg-gray-100 rounded-lg text-sm text-gray-700 font-medium border border-gray-200">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase">Outras Informações</h3>
                  <div className="space-y-2">
                    <p className="text-sm"><span className="font-bold">Trafo:</span> {demand.transformerNumber || 'N/A'}</p>
                    <p className="text-sm"><span className="font-bold">Observação:</span> {demand.observation || 'Sem observações.'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Admin Edit Modal */}
      {user?.role === 'ADMIN' && (
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Editar Demanda"
          maxWidth="max-w-2xl"
        >
          <form 
            onSubmit={(e) => { 
              e.preventDefault(); 
              updateMutation.mutate(editFormData);
            }} 
            className="p-6 space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="date"
                    required
                    className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                    value={editFormData.date}
                    onChange={(e) => setEditFormData({...editFormData, date: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Local</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    required
                    placeholder="Ex: Praça Matriz"
                    className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                    value={editFormData.location}
                    onChange={(e) => setEditFormData({...editFormData, location: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <textarea
                required
                rows={2}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                value={editFormData.description}
                onChange={(e) => setEditFormData({...editFormData, description: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Eletricista Responsável</label>
                <select
                  required
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  value={editFormData.electricianId}
                  onChange={(e) => setEditFormData({...editFormData, electricianId: e.target.value})}
                >
                  <option value="">Selecione...</option>
                  {electricians?.map((e: any) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contato do Solicitante</label>
                <input
                  type="text"
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  value={editFormData.clientNumber}
                  onChange={(e) => setEditFormData({...editFormData, clientNumber: e.target.value})}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center">
                <Package className="h-4 w-4 mr-2" /> Materiais Planejados
              </h3>
              
              <div className="relative">
                <div className="flex gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="Pesquisar material planejado..."
                      value={materialSearch}
                      onChange={(e) => {
                        setMaterialSearch(e.target.value);
                        setShowMaterialResults(true);
                      }}
                      onFocus={() => setShowMaterialResults(true)}
                    />
                  </div>
                </div>

                {showMaterialResults && materialSearch && (
                  <div className="absolute z-10 w-full -mt-3 mb-4 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {filteredMaterials?.map((m: any) => (
                      <button
                        key={m.id}
                        type="button"
                        className="w-full text-left p-3 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                        onClick={() => {
                          handleAddMaterial(m.id);
                          setMaterialSearch('');
                          setShowMaterialResults(false);
                        }}
                      >
                        <span className="text-sm text-gray-700">{m.name}</span>
                        <Plus className="h-4 w-4 text-gray-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {editFormData.materials.map((m) => {
                  const material = materials?.find((mat: any) => mat.id === m.materialId);
                  return (
                    <div key={m.materialId} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <span className="text-sm font-medium text-gray-700">{material?.name}</span>
                      <div className="flex items-center gap-4">
                        <input
                          type="number"
                          min="1"
                          className="w-16 p-1 border border-gray-300 rounded text-center text-sm"
                          value={m.quantity}
                          onChange={(e) => updateMaterialQty(m.materialId, parseInt(e.target.value))}
                        />
                        <button 
                          type="button"
                          onClick={() => removeMaterial(m.materialId)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-4 pt-4 sticky bottom-0 bg-white pb-2">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center disabled:opacity-50"
              >
                {updateMutation.isPending ? <Loader2 className="animate-spin h-5 w-5" /> : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Floating Action Button for Admin Edit */}
      {user?.role === 'ADMIN' && (
        <button
          onClick={handleEditClick}
          className="fixed bottom-8 right-8 bg-blue-600 text-white p-4 rounded-full shadow-2xl hover:bg-blue-700 transition-all hover:scale-110 active:scale-95 z-50 flex items-center gap-2 group border-4 border-white"
          title="Editar Demanda"
        >
          <Pencil className="h-6 w-6" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 ease-in-out font-bold">
            EDITAR DEMANDA
          </span>
        </button>
      )}
    </Layout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: any = {
    PLANNED: { color: 'bg-yellow-100 text-yellow-800', label: 'Planejada' },
    IN_PROGRESS: { color: 'bg-blue-100 text-blue-800', label: 'Em Execução' },
    PENDING_APPROVAL: { color: 'bg-green-100 text-green-800', label: 'Aguardando Aprovação' },
    CONCLUDED: { color: 'bg-purple-100 text-purple-800', label: 'Executada' },
  };

  const config = configs[status] || { color: 'bg-gray-100 text-gray-800', label: status };

  return (
    <span className={`px-4 py-1 rounded-full text-xs font-bold uppercase ${config.color}`}>
      {config.label}
    </span>
  );
}
