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
  Image,
  Loader2, 
  AlertCircle,
  Truck,
  Wrench,
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
import ConfirmDialog from '../components/ConfirmDialog.tsx';

export default function DemandDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [usedMaterials, setUsedMaterials] = useState<any[]>([]);
  const [replacedMaterials, setReplacedMaterials] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [trafo, setTrafo] = useState('');
  const [obs, setObs] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Material Autocomplete States for Completion Form
  const [usedMaterialSearch, setUsedMaterialSearch] = useState('');
  const [showUsedResults, setShowUsedResults] = useState(false);
  const [replacedMaterialSearch, setReplacedMaterialSearch] = useState('');
  const [showReplacedResults, setShowReplacedResults] = useState(false);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditingExecution, setIsEditingExecution] = useState(false);
  const [editFormData, setEditFormData] = useState({
    date: '',
    location: '',
    description: '',
    clientNumber: '',
    electricianIds: [] as string[],
    materials: [] as { materialId: string; quantity: number }[],
    transformerNumber: '',
    observation: '',
    vehicles: [] as string[],
    tools: [] as string[],
    usedMaterials: [] as { materialId: string; quantity: number }[],
    returnedMaterials: [] as { materialId: string; quantity: number }[],
    recoveredMaterials: [] as { materialId: string; quantity: number }[]
  });
  const [materialSearch, setMaterialSearch] = useState('');
  const [showMaterialResults, setShowMaterialResults] = useState(false);
  const [editUsedSearch, setEditUsedSearch] = useState('');
  const [showEditUsedResults, setShowEditUsedResults] = useState(false);
  const [editRetSearch, setEditRetSearch] = useState('');
  const [showEditRetResults, setShowEditRetResults] = useState(false);
  const [editRecSearch, setEditRecSearch] = useState('');
  const [showEditRecResults, setShowEditRecResults] = useState(false);

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
    },
    enabled: !!user && user.role === 'ADMIN'
  });

  const { data: registeredVehicles } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => (await api.get('/vehicles')).data,
  });

  const { data: registeredTools } = useQuery({
    queryKey: ['tools'],
    queryFn: async () => (await api.get('/tools')).data,
  });

  // Calculate surplus materials (planned - used)
  const surplusMaterials = React.useMemo(() => {
    if (!demand?.plannedMaterials) return [];
    
    return demand.plannedMaterials.map((pm: any) => {
      const used = usedMaterials.find(um => String(um.materialId) === String(pm.materialId));
      const usedQty = used ? Number(used.quantity) : 0;
      const surplusQty = Number(pm.quantity) - usedQty;
      
      return {
        ...pm.material,
        plannedQty: pm.quantity,
        usedQty,
        surplusQty: Math.max(0, surplusQty)
      };
    }).filter((m: any) => m.surplusQty > 0);
  }, [demand?.plannedMaterials, usedMaterials]);

  // Pre-populate used materials from planned ones for better UX and consistency
  React.useEffect(() => {
    if (demand && demand.status === 'PENDING' && demand.plannedMaterials && usedMaterials.length === 0) {
      const initial = demand.plannedMaterials.map((pm: any) => ({
        materialId: pm.materialId,
        quantity: 0
      }));
      setUsedMaterials(initial);
    }
  }, [demand]);

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
      setIsEditingExecution(false);
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

  const declineMutation = useMutation({
    mutationFn: async () => await api.put(`/demands/${id}`, { status: 'PENDING' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      queryClient.invalidateQueries({ queryKey: ['demand', id] });
      setFeedback({ type: 'success', message: 'Serviço reprovado. Retornou para o eletricista.' });
      setTimeout(() => setFeedback(null), 3000);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => await api.delete(`/demands/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demands'] });
      setFeedback({ type: 'success', message: 'Demanda excluída com sucesso!' });
      setTimeout(() => navigate('/'), 1500);
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
    setUsedMaterialSearch('');
    setShowUsedResults(false);
  };

  const handleAddReplacedMaterial = (matId: string) => {
    if (!matId) return;
    if (replacedMaterials.find(m => m.materialId === matId)) return;
    setReplacedMaterials([...replacedMaterials, { materialId: matId, quantity: 1 }]);
    setReplacedMaterialSearch('');
    setShowReplacedResults(false);
  };

  const handleVehicleToggle = (v: string) => {
    setVehicles(prev => prev.includes(v) ? prev.filter(item => item !== v) : [...prev, v]);
  };

  const handleToolToggle = (t: string) => {
    setSelectedTools(prev => {
      const isNone = t.toLowerCase() === 'nenhuma';
      if (isNone) {
        return prev.includes(t) ? [] : [t];
      } else {
        const withoutNone = prev.filter(item => item.toLowerCase() !== 'nenhuma');
        return withoutNone.includes(t)
          ? withoutNone.filter(item => item !== t)
          : [...withoutNone, t];
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo && !isEditingExecution) {
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
    if (photo) {
      formData.append('photo', photo);
    }
    formData.append('usedMaterials', JSON.stringify(usedMaterials));
    formData.append('replacedMaterials', JSON.stringify(replacedMaterials));
    formData.append('vehicles', vehicles.join(','));
    formData.append('tools', selectedTools.join(','));
    formData.append('transformerNumber', trafo);
    formData.append('observation', obs);

    finishMutation.mutate(formData);
  };

  const handleEditClick = () => {
    if (!demand) return;

    if (user?.role === 'ELECTRICIAN') {
      if (demand.status === 'PENDING_APPROVAL') {
        // For electricians in pending approval, we "edit" the execution
        setUsedMaterials(demand.usedMaterials?.map((m: any) => ({ materialId: m.materialId, quantity: m.quantity })) || []);
        setReplacedMaterials(demand.returnedMaterials?.filter((m: any) => m.type === 'DEFECTIVE').map((m: any) => ({ materialId: m.materialId, quantity: m.quantity })) || []);
        setVehicles(demand.vehicles || []);
        setSelectedTools(demand.tools || []);
        setTrafo(demand.transformerNumber || '');
        setObs(demand.observation || '');
        setPhotoPreview(demand.photoUrl || null);
        setIsEditingExecution(true);
      }
      return;
    }

    setEditFormData({
      date: format(new Date(demand.date), 'yyyy-MM-dd'),
      location: demand.location,
      description: demand.description,
      clientNumber: demand.clientNumber || '',
      electricianIds: demand.electricians?.map((e: any) => e.id) || [],
      materials: demand.plannedMaterials?.map((pm: any) => ({
        materialId: pm.materialId,
        quantity: pm.quantity
      })) || [],
      transformerNumber: demand.transformerNumber || '',
      observation: demand.observation || '',
      vehicles: demand.vehicles || [],
      tools: demand.tools || [],
      usedMaterials: demand.usedMaterials?.map((um: any) => ({
        materialId: um.materialId,
        quantity: um.quantity
      })) || [],
      returnedMaterials: demand.returnedMaterials?.filter((rm: any) => rm.type === 'DEFECTIVE').map((rm: any) => ({
        materialId: rm.materialId,
        quantity: rm.quantity,
        type: 'DEFECTIVE'
      })) || [],
      recoveredMaterials: demand.returnedMaterials?.filter((rm: any) => rm.type === 'RECOVERED').map((rm: any) => ({
        materialId: rm.materialId,
        quantity: rm.quantity,
        type: 'RECOVERED'
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
        <div className="flex items-center gap-3">
          {(user?.role === 'ADMIN' || (user?.role === 'ELECTRICIAN' && demand.status === 'PENDING_APPROVAL')) && (
            <div className="flex gap-2">
              <button
                onClick={handleEditClick}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                title="Editar Demanda"
              >
                <Pencil className="h-5 w-5" />
              </button>
              {user?.role === 'ADMIN' && (
                <button
                  onClick={() => {
                    setConfirmDialog({
                      isOpen: true,
                      title: 'Excluir Demanda',
                      message: 'Tem certeza que deseja excluir esta demanda definitivamente?',
                      onConfirm: () => deleteMutation.mutate()
                    });
                  }}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                  title="Excluir Demanda"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
          <StatusBadge status={demand.status} />
        </div>
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
              <div className="flex items-start">
                <User className="h-5 w-5 text-blue-500 mr-3 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500 uppercase font-bold">Responsáveis</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {demand.electricians?.map((e: any) => (
                      <span key={e.id} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium border border-blue-100">
                        {e.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
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
          {((demand.status === 'PENDING' && isElectrician) || (isElectrician && demand.status === 'PENDING_APPROVAL' && isEditingExecution)) ? (
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-8">
              <div className="flex justify-between items-center border-b pb-4">
                <h2 className="text-2xl font-bold text-gray-900">{isEditingExecution ? 'Editar Execução' : 'Concluir Serviço'}</h2>
                {isEditingExecution && (
                  <button 
                    type="button"
                    onClick={() => {
                      setIsEditingExecution(false);
                      setPhoto(null);
                      setPhotoPreview(demand?.photoUrl || null);
                    }}
                    className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                  >
                    Cancelar Edição
                  </button>
                )}
              </div>
              
              {/* Photo Upload */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-4">Foto do Serviço (Obrigatório)</label>
                <div className="space-y-4">
                  <div 
                    className="w-full h-64 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center overflow-hidden relative bg-gray-50 shadow-inner"
                  >
                    {photoPreview ? (
                      <>
                        <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                        <button 
                          type="button"
                          onClick={() => { setPhoto(null); setPhotoPreview(null); }}
                          className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full shadow-lg hover:bg-red-700 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <div className="text-center p-6">
                        <Camera className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                        <p className="text-xs text-gray-400 font-medium">Nenhuma foto selecionada</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      type="button" 
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-2 p-4 bg-blue-50 text-blue-700 rounded-2xl font-bold hover:bg-blue-100 transition-all border border-blue-100 shadow-sm"
                    >
                      <Camera className="h-6 w-6" />
                      <span className="text-xs">Tirar Foto</span>
                    </button>
                    <button 
                      type="button" 
                      onClick={() => galleryInputRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-50 text-gray-700 rounded-2xl font-bold hover:bg-gray-100 transition-all border border-gray-200 shadow-sm"
                    >
                      <Image className="h-6 w-6" />
                      <span className="text-xs">Carregar Galeria</span>
                    </button>
                  </div>
                  
                  <input 
                    ref={fileInputRef} 
                    type="file" 
                    className="hidden" 
                    accept="image/*" 
                    capture="environment" 
                    onChange={handleFileChange} 
                  />
                  <input 
                    ref={galleryInputRef} 
                    type="file" 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleFileChange} 
                  />
                </div>
              </div>

              {/* Used Materials */}
              <div className="relative">
                <label className="block text-sm font-bold text-gray-700 mb-4">Materiais Utilizados (Obrigatório)</label>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    className="w-full pl-10 p-3 border border-gray-300 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Pesquisar material utilizado..."
                    value={usedMaterialSearch}
                    onChange={(e) => {
                      setUsedMaterialSearch(e.target.value);
                      setShowUsedResults(true);
                    }}
                    onFocus={() => setShowUsedResults(true)}
                  />
                  
                  {showUsedResults && usedMaterialSearch && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                      {materials?.filter((m: any) => m.name.toLowerCase().includes(usedMaterialSearch.toLowerCase())).map((m: any) => (
                        <button
                          key={m.id}
                          type="button"
                          className="w-full text-left p-3 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                          onClick={() => {
                            handleAddUsedMaterial(m.id);
                            setUsedMaterialSearch('');
                            setShowUsedResults(false);
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
                  {usedMaterials.map(m => {
                    const material = materials?.find((mat: any) => mat.id === m.materialId);
                    return (
                      <div key={m.materialId} className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <span className="text-sm font-medium">{material?.name}</span>
                        <div className="flex items-center gap-3">
                          <input 
                            type="number" 
                            min="0"
                            className="w-20 p-2 border border-blue-200 rounded-lg text-center"
                            value={String(m.quantity)}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : Number(e.target.value);
                              setUsedMaterials(prev => prev.map(item => 
                                item.materialId === m.materialId ? { ...item, quantity: val } : item
                              ));
                            }}
                          />
                          <button 
                            type="button"
                            onClick={() => setUsedMaterials(prev => prev.filter(item => item.materialId !== m.materialId))}
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

              {/* Surplus Materials Disclosure */}
              {surplusMaterials.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6">
                  <h3 className="text-sm font-bold text-yellow-800 mb-3 flex items-center uppercase">
                    <AlertCircle className="h-4 w-4 mr-2" /> Materiais para Retorno (Sobra)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {surplusMaterials.map((m: any) => (
                      <div key={m.id} className="flex justify-between items-center p-2 bg-white rounded-lg border border-yellow-100 text-sm">
                        <span className="text-gray-700 font-medium">{m.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">Restante:</span>
                          <span className="font-bold text-yellow-700">{m.surplusQty} {m.unit || 'un'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-yellow-600 mt-3 italic">
                    * Estes materiais constam no planejamento mas não foram marcados como utilizados. Eles serão registrados automaticamente como materiais retornados.
                  </p>
                </div>
              )}

              {/* Replaced Materials */}
              <div className="relative">
                <label className="block text-sm font-bold text-gray-700 mb-2">Materiais Retornados / Defeituosos</label>
                <p className="text-xs text-gray-500 mb-4">Informe o que foi removido/substituído.</p>
                
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    className="w-full pl-10 p-3 border border-gray-300 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Pesquisar material substituído..."
                    value={replacedMaterialSearch}
                    onChange={(e) => {
                      setReplacedMaterialSearch(e.target.value);
                      setShowReplacedResults(true);
                    }}
                    onFocus={() => setShowReplacedResults(true)}
                  />
                  
                  {showReplacedResults && replacedMaterialSearch && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                      {materials?.filter((m: any) => m.name.toLowerCase().includes(replacedMaterialSearch.toLowerCase())).map((m: any) => (
                        <button
                          key={m.id}
                          type="button"
                          className="w-full text-left p-3 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                          onClick={() => {
                            handleAddReplacedMaterial(m.id);
                            setReplacedMaterialSearch('');
                            setShowReplacedResults(false);
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
                  {replacedMaterials.map(m => {
                    const material = materials?.find((mat: any) => mat.id === m.materialId);
                    return (
                      <div key={m.materialId} className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100">
                        <span className="text-sm font-medium">{material?.name}</span>
                        <div className="flex items-center gap-3">
                          <input 
                            type="number" 
                            min="0" 
                            className="w-20 p-2 border border-red-200 rounded-lg text-center"
                            value={String(m.quantity)}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : Number(e.target.value);
                              setReplacedMaterials(prev => prev.map(item => 
                                item.materialId === m.materialId ? { ...item, quantity: val } : item
                              ));
                            }}
                          />
                          <button 
                            type="button"
                            onClick={() => setReplacedMaterials(prev => prev.filter(item => item.materialId !== m.materialId))}
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

              {/* Vehicles */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-4">Veículo / Equipamento (Obrigatório)</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {registeredVehicles?.map((v: any) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleVehicleToggle(v.name)}
                      className={`
                        p-3 rounded-xl border-2 text-sm font-medium transition-all flex items-center justify-center
                        ${vehicles.includes(v.name) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-300'}
                      `}
                    >
                      <Truck className={`h-4 w-4 mr-2 ${vehicles.includes(v.name) ? 'text-white' : 'text-gray-400'}`} />
                      {v.name}
                    </button>
                  ))}
                  {registeredVehicles?.length === 0 && (
                    <p className="col-span-full text-sm text-gray-400 italic">Nenhum veículo cadastrado pelo sistema.</p>
                  )}
                </div>
              </div>

              {/* Tools */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-4">Ferramentas Utilizadas</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {registeredTools?.map((t: any) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleToolToggle(t.name)}
                      className={`
                        p-3 rounded-xl border-2 text-sm font-medium transition-all flex items-center justify-center
                        ${selectedTools.includes(t.name) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-300'}
                      `}
                    >
                      <Wrench className={`h-4 w-4 mr-2 ${selectedTools.includes(t.name) ? 'text-white' : 'text-gray-400'}`} />
                      {t.name}
                    </button>
                  ))}
                  {registeredTools?.length === 0 && (
                    <p className="col-span-full text-sm text-gray-400 italic">Nenhuma ferramenta cadastrada pelo sistema.</p>
                  )}
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
                    <CheckCircle className="h-6 w-6 mr-2" /> {isEditingExecution ? 'SALVAR ALTERAÇÕES' : 'FINALIZAR SERVIÇO'}
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-8">
              <div className="flex justify-between items-center border-b pb-4">
                <h2 className="text-2xl font-bold text-gray-900">Resumo da Execução</h2>
                {user?.role === 'ADMIN' && demand.status === 'PENDING_APPROVAL' && (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setConfirmDialog({
                          isOpen: true,
                          title: 'Reprovar Execução',
                          message: 'Reprovar execução e retornar para o eletricista?',
                          variant: 'warning',
                          onConfirm: () => declineMutation.mutate()
                        });
                      }}
                      className="bg-red-50 text-red-600 px-4 py-2 rounded-xl font-bold hover:bg-red-100 transition-colors flex items-center border border-red-100"
                    >
                      REPROVAR
                    </button>
                    <button 
                      onClick={() => approveMutation.mutate()}
                      className="bg-purple-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-purple-700 flex items-center shadow-lg shadow-purple-200"
                    >
                      <CheckCircle className="h-5 w-5 mr-2" /> APROVAR
                    </button>
                  </div>
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
                    {demand.returnedMaterials?.filter((m: any) => m.type !== 'RECOVERED').map((m: any) => (
                      <div key={m.id} className={`flex justify-between p-3 rounded-xl border text-sm ${m.type === 'DEFECTIVE' ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex flex-col">
                          <span className="font-medium">{m.material?.name || m.materialName}</span>
                          <span className="text-[10px] uppercase font-bold text-gray-400">{m.type === 'DEFECTIVE' ? 'Substituído' : 'Não Utilizado'}</span>
                        </div>
                        <span className="font-bold flex items-center">{m.quantity}</span>
                      </div>
                    ))}
                    {demand.returnedMaterials?.filter((m: any) => m.type === 'RECOVERED').length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <h4 className="text-xs font-bold text-green-700 mb-2 uppercase">Materiais Recuperados</h4>
                        {demand.returnedMaterials?.filter((m: any) => m.type === 'RECOVERED').map((m: any) => (
                          <div key={m.id} className="flex justify-between p-3 bg-green-50 rounded-xl border border-green-100 text-sm mb-2">
                            <span className="font-medium text-green-800">{m.material?.name || m.materialName}</span>
                            <span className="font-bold text-green-700">{m.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}
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
                  <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase">Ferramentas Utilizadas</h3>
                  <div className="flex flex-wrap gap-2">
                    {demand.tools?.map((t: string) => (
                      <span key={t} className="px-3 py-1 bg-gray-100 rounded-lg text-sm text-gray-700 font-medium border border-gray-200">
                        {t}
                      </span>
                    ))}
                    {(!demand.tools || demand.tools.length === 0) && <p className="text-gray-500 text-sm italic">Nenhuma ferramenta indicada.</p>}
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

      {/* Edit Modal */}
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
              updateMutation.mutate({
                ...editFormData,
                returnedMaterials: [
                  ...editFormData.returnedMaterials.map(m => ({ ...m, type: 'DEFECTIVE' })),
                  ...editFormData.recoveredMaterials.map(m => ({ ...m, type: 'RECOVERED' }))
                ]
              });
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
                    readOnly={user?.role !== 'ADMIN'}
                    className={`w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm ${user?.role !== 'ADMIN' ? 'bg-gray-50' : ''}`}
                    value={editFormData.date}
                    onChange={(e) => user?.role === 'ADMIN' && setEditFormData({...editFormData, date: e.target.value})}
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
                    readOnly={user?.role !== 'ADMIN'}
                    placeholder="Ex: Praça Matriz"
                    className={`w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm ${user?.role !== 'ADMIN' ? 'bg-gray-50' : ''}`}
                    value={editFormData.location}
                    onChange={(e) => user?.role === 'ADMIN' && setEditFormData({...editFormData, location: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <textarea
                required
                readOnly={user?.role !== 'ADMIN' && demand.status === 'PENDING'}
                rows={2}
                className={`w-full p-2 border border-gray-300 rounded-lg text-sm ${(user?.role !== 'ADMIN' && demand.status === 'PENDING') ? 'bg-gray-50' : ''}`}
                value={editFormData.description}
                onChange={(e) => (user?.role === 'ADMIN' || demand.status !== 'PENDING') && setEditFormData({...editFormData, description: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {user?.role === 'ADMIN' ? (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Eletricistas Responsáveis</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 border border-gray-300 rounded-lg max-h-40 overflow-y-auto">
                    {electricians?.map((e: any) => (
                      <label key={e.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer border border-transparent hover:border-gray-100">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={editFormData.electricianIds.includes(e.id)}
                          onChange={(evt) => {
                            const newIds = evt.target.checked
                              ? [...editFormData.electricianIds, e.id]
                              : editFormData.electricianIds.filter(id => id !== e.id);
                            setEditFormData({...editFormData, electricianIds: newIds});
                          }}
                        />
                        <span className="text-xs text-gray-700 truncate" title={e.name}>{e.name}</span>
                      </label>
                    ))}
                  </div>
                  {editFormData.electricianIds.length === 0 && (
                    <p className="text-red-500 text-[10px] mt-1 font-medium">* Selecione pelo menos um eletricista.</p>
                  )}
                </div>
              ) : (
                <div className="md:col-span-2">
                   <p className="text-xs text-gray-500 italic">Responsáveis: {demand.electricians?.map((e: any) => e.name).join(', ')}</p>
                </div>
              )}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Contato do Solicitante</label>
                <input
                  type="text"
                  readOnly={user?.role !== 'ADMIN'}
                  className={`w-full p-2 border border-gray-300 rounded-lg text-sm ${user?.role !== 'ADMIN' ? 'bg-gray-50' : ''}`}
                  value={editFormData.clientNumber}
                  onChange={(e) => user?.role === 'ADMIN' && setEditFormData({...editFormData, clientNumber: e.target.value})}
                />
              </div>
            </div>

            <div className="border-t pt-4 space-y-6">
              {(user?.role === 'ADMIN' || demand.status === 'PENDING') && (
                <div>
                  <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center">
                    <Package className="h-4 w-4 mr-2" /> Materiais Planejados
                  </h3>
                  <div className="relative mb-4">
                    <div className="relative">
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
                    {showMaterialResults && materialSearch && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                        {filteredMaterials?.map((m: any) => (
                          <button
                            key={m.id}
                            type="button"
                            className="w-full text-left p-2 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
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
                        <div key={m.materialId} className="flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-200">
                          <span className="text-sm font-medium text-gray-700">{material?.name}</span>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              min="1"
                              className="w-16 p-1 border border-gray-300 rounded text-center text-sm"
                              value={m.quantity}
                              onChange={(e) => updateMaterialQty(m.materialId, parseInt(e.target.value))}
                            />
                            <button type="button" onClick={() => removeMaterial(m.materialId)} className="text-red-500 hover:text-red-700">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Execution Data */}
              {(user?.role === 'ADMIN' || demand.status === 'PENDING_APPROVAL') && (
                <div className="border-t pt-4 space-y-6">
                  <h3 className="text-sm font-bold text-gray-800 flex items-center uppercase">
                    <CheckCircle className="h-4 w-4 mr-2" /> Dados da Execução
                  </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número do Trafo</label>
                    <input
                      type="text"
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                      value={editFormData.transformerNumber}
                      onChange={(e) => setEditFormData({...editFormData, transformerNumber: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Observação</label>
                    <input
                      type="text"
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                      value={editFormData.observation}
                      onChange={(e) => setEditFormData({...editFormData, observation: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Veículos</label>
                  <div className="flex flex-wrap gap-2">
                    {registeredVehicles?.map((v: any) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          const exists = editFormData.vehicles.includes(v.name);
                          setEditFormData({
                            ...editFormData,
                            vehicles: exists 
                              ? editFormData.vehicles.filter(name => name !== v.name)
                              : [...editFormData.vehicles, v.name]
                          });
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          editFormData.vehicles.includes(v.name)
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400'
                        }`}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ferramentas</label>
                  <div className="flex flex-wrap gap-2">
                    {registeredTools?.map((t: any) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          const isNone = t.name.toLowerCase() === 'nenhuma';
                          let newTools;
                          if (isNone) {
                            newTools = editFormData.tools.includes(t.name) ? [] : [t.name];
                          } else {
                            const withoutNone = editFormData.tools.filter(name => name.toLowerCase() !== 'nenhuma');
                            newTools = withoutNone.includes(t.name)
                              ? withoutNone.filter(name => name !== t.name)
                              : [...withoutNone, t.name];
                          }
                          setEditFormData({
                            ...editFormData,
                            tools: newTools
                          });
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          editFormData.tools.includes(t.name)
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400'
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Used Materials in Edit */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Materiais Utilizados</label>
                  <div className="relative mb-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Adicionar material utilizado..."
                        value={editUsedSearch}
                        onChange={(e) => {
                          setEditUsedSearch(e.target.value);
                          setShowEditUsedResults(true);
                        }}
                        onFocus={() => setShowEditUsedResults(true)}
                      />
                    </div>
                    {showEditUsedResults && editUsedSearch && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                        {materials?.filter((m: any) => m.name.toLowerCase().includes(editUsedSearch.toLowerCase())).map((m: any) => (
                          <button
                            key={m.id}
                            type="button"
                            className="w-full text-left p-2 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                            onClick={() => {
                              if (!editFormData.usedMaterials.find(x => x.materialId === m.id)) {
                                setEditFormData({
                                  ...editFormData,
                                  usedMaterials: [...editFormData.usedMaterials, { materialId: m.id, quantity: 1 }]
                                });
                              }
                              setEditUsedSearch('');
                              setShowEditUsedResults(false);
                            }}
                          >
                            <span className="text-sm text-gray-700">{m.name}</span>
                            <Plus className="h-4 w-4 text-gray-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    {editFormData.usedMaterials.map(m => {
                      const mat = materials?.find((x: any) => x.id === m.materialId);
                      return (
                        <div key={m.materialId} className="flex items-center justify-between bg-blue-50/50 p-2 rounded-lg text-xs">
                          <span>{mat?.name}</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              className="w-12 p-1 border rounded text-center" 
                              value={m.quantity}
                              onChange={(e) => setEditFormData({
                                ...editFormData,
                                usedMaterials: editFormData.usedMaterials.map(x => x.materialId === m.materialId ? { ...x, quantity: parseInt(e.target.value) } : x)
                              })}
                            />
                            <button 
                              type="button"
                              onClick={() => setEditFormData({...editFormData, usedMaterials: editFormData.usedMaterials.filter(x => x.materialId !== m.materialId)})}
                              className="text-red-500"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recovered Materials in Edit */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Materiais Recuperados (Consertados)</label>
                  <div className="relative mb-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Adicionar material recuperado..."
                        value={editRecSearch}
                        onChange={(e) => {
                          setEditRecSearch(e.target.value);
                          setShowEditRecResults(true);
                        }}
                        onFocus={() => setShowEditRecResults(true)}
                      />
                    </div>
                    {showEditRecResults && editRecSearch && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                        {materials?.filter((m: any) => m.name.toLowerCase().includes(editRecSearch.toLowerCase())).map((m: any) => (
                          <button
                            key={m.id}
                            type="button"
                            className="w-full text-left p-2 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                            onClick={() => {
                              if (!editFormData.recoveredMaterials.find(x => x.materialId === m.id)) {
                                setEditFormData({
                                  ...editFormData,
                                  recoveredMaterials: [...editFormData.recoveredMaterials, { materialId: m.id, quantity: 1 }]
                                });
                              }
                              setEditRecSearch('');
                              setShowEditRecResults(false);
                            }}
                          >
                            <span className="text-sm text-gray-700">{m.name}</span>
                            <Plus className="h-4 w-4 text-gray-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    {editFormData.recoveredMaterials.map(m => {
                      const mat = materials?.find((x: any) => x.id === m.materialId);
                      return (
                        <div key={m.materialId} className="flex items-center justify-between bg-green-50/50 p-2 rounded-lg text-xs">
                          <span>{mat?.name}</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              className="w-12 p-1 border rounded text-center" 
                              value={m.quantity}
                              onChange={(e) => setEditFormData({
                                ...editFormData,
                                recoveredMaterials: editFormData.recoveredMaterials.map(x => x.materialId === m.materialId ? { ...x, quantity: parseInt(e.target.value) } : x)
                              })}
                            />
                            <button 
                              type="button"
                              onClick={() => setEditFormData({...editFormData, recoveredMaterials: editFormData.recoveredMaterials.filter(x => x.materialId !== m.materialId)})}
                              className="text-red-500"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Returned Materials in Edit */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Materiais Substituídos</label>
                  <div className="relative mb-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        className="w-full pl-10 p-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Adicionar material substituído..."
                        value={editRetSearch}
                        onChange={(e) => {
                          setEditRetSearch(e.target.value);
                          setShowEditRetResults(true);
                        }}
                        onFocus={() => setShowEditRetResults(true)}
                      />
                    </div>
                    {showEditRetResults && editRetSearch && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                        {materials?.filter((m: any) => m.name.toLowerCase().includes(editRetSearch.toLowerCase())).map((m: any) => (
                          <button
                            key={m.id}
                            type="button"
                            className="w-full text-left p-2 hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0"
                            onClick={() => {
                              if (!editFormData.returnedMaterials.find(x => x.materialId === m.id)) {
                                setEditFormData({
                                  ...editFormData,
                                  returnedMaterials: [...editFormData.returnedMaterials, { materialId: m.id, quantity: 1 }]
                                });
                              }
                              setEditRetSearch('');
                              setShowEditRetResults(false);
                            }}
                          >
                            <span className="text-sm text-gray-700">{m.name}</span>
                            <Plus className="h-4 w-4 text-gray-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    {editFormData.returnedMaterials.map(m => {
                      const mat = materials?.find((x: any) => x.id === m.materialId);
                      return (
                        <div key={m.materialId} className="flex items-center justify-between bg-red-50/50 p-2 rounded-lg text-xs">
                          <span>{mat?.name}</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              className="w-12 p-1 border rounded text-center" 
                              value={m.quantity}
                              onChange={(e) => setEditFormData({
                                ...editFormData,
                                returnedMaterials: editFormData.returnedMaterials.map(x => x.materialId === m.materialId ? { ...x, quantity: parseInt(e.target.value) } : x)
                              })}
                            />
                            <button 
                              type="button"
                              onClick={() => setEditFormData({...editFormData, returnedMaterials: editFormData.returnedMaterials.filter(x => x.materialId !== m.materialId)})}
                              className="text-red-500"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
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
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={(confirmDialog as any).variant}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
      />
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
    <span className={`px-4 py-1 rounded-full text-xs font-bold uppercase ${config.color}`}>
      {config.label}
    </span>
  );
}
