import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  CalendarPlus,
  CheckSquare,
  FileSpreadsheet,
  FolderOpen,
  History,
  LogOut,
  Menu,
  PlayCircle,
  Settings,
  Table2,
  Wrench,
  X,
} from 'lucide-react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import {
  Booking,
  BookingRequest,
  BookingStatus,
  ConfirmationTicket,
  CustomSpreadsheet,
  DEFAULT_CONFIRM_TEMPLATE,
  DEFAULT_OWNER_WHATSAPP,
  LibrarySheet,
  SCHEMA_LIMITS,
  ServiceItem,
  SpreadsheetGroupBy,
  SpreadsheetSegment,
  UserProfile,
} from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PublicConfirmationView } from './components/PublicConfirmationView';
import { PublicBookingView } from './components/PublicBookingView';
import { SpreadsheetView } from './components/SpreadsheetView';
import { ExecutionView } from './components/ExecutionView';
import { BookingManagerView } from './components/BookingManagerView';
import { ServicesView } from './components/ServicesView';
import { CustomSpreadsheetsView } from './components/CustomSpreadsheetsView';
import { LibraryView } from './components/LibraryView';
import { HistoryView, SettingsView } from './components/HistoryAndSettingsView';
import { formatPhoneDisplay } from './utils/whatsapp';

type NavTab =
  | 'planilha'
  | 'atendimento'
  | 'agendar'
  | 'servicos'
  | 'personalizadas'
  | 'biblioteca'
  | 'historico'
  | 'configuracoes';

const NAV_LABELS: Record<NavTab, string> = {
  planilha: 'Planilha Automática',
  atendimento: 'Em Atendimento',
  agendar: 'Agendar Serviço',
  servicos: 'Meus Serviços',
  personalizadas: 'Planilhas Profissionais',
  biblioteca: 'Biblioteca de Planilhas',
  historico: 'Histórico Concluídos',
  configuracoes: 'Configurações',
};

function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const rand2 = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}${rand2}`;
}

function AppWorkspace() {
  const [urlParams, setUrlParams] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      confirmToken: params.get('token') || '',
      confirmBookingId: params.get('confirmar') || '',
      publicAgendarOwner: params.get('agendar') || '',
    };
  });

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [spreadsheets, setSpreadsheets] = useState<CustomSpreadsheet[]>([]);
  const [librarySheets, setLibrarySheets] = useState<LibrarySheet[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [activeTab, setActiveTab] = useState<NavTab>('planilha');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const syncingConfirmationsRef = useRef<Set<string>>(new Set());
  const syncingRequestsRef = useRef<Set<string>>(new Set());

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Ensure user profile doc exists on sign-in
  useEffect(() => {
    if (!authReady || !user) {
      setProfile(null);
      return;
    }
    const uid = user.uid;
    let active = true;
    async function ensureProfile() {
      const userRef = doc(db, 'users', uid);
      const publicProfileRef = doc(db, 'publicProfiles', uid);
      try {
        const snap = await getDoc(userRef);
        if (!active) return;
        let resolvedBusinessName = (user?.displayName || 'Minha Empresa')
          .trim()
          .slice(0, SCHEMA_LIMITS.NAME_MAX) || 'Minha Empresa';

        if (snap.exists()) {
          const existingProfile = snap.data() as UserProfile;
          resolvedBusinessName =
            existingProfile.businessName?.trim().slice(0, SCHEMA_LIMITS.NAME_MAX) ||
            resolvedBusinessName;
          setProfile(existingProfile);
        } else {
          const newProfile: UserProfile = {
            uid,
            displayName: (user?.displayName || 'Profissional').slice(0, SCHEMA_LIMITS.NAME_MAX),
            email: (user?.email || 'sem-email@planilhaflow.app').slice(0, 180),
            businessName: resolvedBusinessName,
            whatsappNumber: DEFAULT_OWNER_WHATSAPP,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(userRef, newProfile);
          if (active) setProfile(newProfile);
        }

        // Garante perfil público (sem PII) para validação do link ?agendar=<ownerId>
        const publicSnap = await getDoc(publicProfileRef);
        if (!active) return;
        if (!publicSnap.exists()) {
          await setDoc(publicProfileRef, {
            uid,
            businessName: resolvedBusinessName,
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `users/${uid}`);
      }
    }
    ensureProfile();
    return () => {
      active = false;
    };
  }, [authReady, user]);

  // Attach real-time Firestore listeners only when authenticated
  useEffect(() => {
    if (!authReady || !user) {
      setServices([]);
      setBookings([]);
      setSpreadsheets([]);
      setLibrarySheets([]);
      setLoadingData(false);
      return;
    }

    const uid = user.uid;
    setLoadingData(true);

    const unsubServices = onSnapshot(
      query(collection(db, 'services'), where('ownerId', '==', uid)),
      (snap) => {
        const list: ServiceItem[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ServiceItem, 'id'>),
        }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setServices(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'services')
    );

    const unsubBookings = onSnapshot(
      query(collection(db, 'bookings'), where('ownerId', '==', uid)),
      (snap) => {
        const list: Booking[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Booking, 'id'>),
        }));
        setBookings(list);
        setLoadingData(false);
      },
      (err) => {
        setLoadingData(false);
        handleFirestoreError(err, OperationType.LIST, 'bookings');
      }
    );

    const unsubSheets = onSnapshot(
      query(collection(db, 'spreadsheets'), where('ownerId', '==', uid)),
      (snap) => {
        const list: CustomSpreadsheet[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CustomSpreadsheet, 'id'>),
        }));
        list.sort((a, b) => a.title.localeCompare(b.title));
        setSpreadsheets(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'spreadsheets')
    );

    const unsubLibrarySheets = onSnapshot(
      query(collection(db, 'librarySheets'), where('ownerId', '==', uid)),
      (snap) => {
        const list: LibrarySheet[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LibrarySheet, 'id'>),
        }));
        list.sort((a, b) => a.fileName.localeCompare(b.fileName));
        setLibrarySheets(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'librarySheets')
    );

    // Sync client-confirmed completion tickets -> automatically finalize booking so it exits active spreadsheet
    const unsubConfirmations = onSnapshot(
      query(
        collection(db, 'confirmations'),
        where('ownerId', '==', uid),
        where('status', '==', 'finalizado')
      ),
      async (snap) => {
        for (const d of snap.docs) {
          const ticket = d.data() as ConfirmationTicket;
          if (!ticket.bookingId || syncingConfirmationsRef.current.has(ticket.bookingId)) continue;
          syncingConfirmationsRef.current.add(ticket.bookingId);
          try {
            const bRef = doc(db, 'bookings', ticket.bookingId);
            const bSnap = await getDoc(bRef);
            if (bSnap.exists()) {
              const bData = bSnap.data() as Booking;
              if (
                bData.status === BookingStatus.AGENDADO ||
                bData.status === BookingStatus.EM_ANDAMENTO
              ) {
                await updateDoc(bRef, {
                  status: BookingStatus.FINALIZADO,
                  updatedAt: serverTimestamp(),
                });
              }
            }
          } catch (err) {
            console.error('Erro ao sincronizar confirmação do cliente:', err);
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'confirmations')
    );

    // Sync public booking requests -> automatically append to bookings + active spreadsheet
    const unsubRequests = onSnapshot(
      query(
        collection(db, 'bookingRequests'),
        where('ownerId', '==', uid),
        where('processed', '==', false)
      ),
      async (snap) => {
        for (const d of snap.docs) {
          if (syncingRequestsRef.current.has(d.id)) continue;
          syncingRequestsRef.current.add(d.id);
          const reqData = d.data() as Omit<BookingRequest, 'id'>;
          try {
            const bookingId = generateSafeId('ag');
            const confirmToken = generateSafeId('conf');
            const batch = writeBatch(db);
            batch.set(doc(db, 'bookings', bookingId), {
              ownerId: uid,
              serviceId: reqData.serviceId,
              serviceName: reqData.serviceName,
              servicePrice: reqData.servicePrice,
              clientName: reqData.clientName,
              clientPhone: reqData.clientPhone,
              serviceAddress: reqData.serviceAddress,
              scheduledDate: reqData.scheduledDate,
              scheduledTime: reqData.scheduledTime,
              notes: reqData.notes || '',
              status: BookingStatus.AGENDADO,
              confirmToken,
              whatsappConfirmedSent: false,
              whatsappOwnerNotified: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            batch.set(doc(db, 'confirmations', confirmToken), {
              bookingId,
              ownerId: uid,
              serviceName: reqData.serviceName,
              servicePrice: reqData.servicePrice,
              scheduledDate: reqData.scheduledDate,
              scheduledTime: reqData.scheduledTime,
              businessName: profile?.businessName || user.displayName || 'PlanilhaFlow',
              status: 'pendente',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            batch.update(doc(db, 'bookingRequests', d.id), {
              processed: true,
            });
            await batch.commit();
          } catch (err) {
            console.error('Erro ao importar solicitação de agendamento:', err);
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bookingRequests')
    );

    return () => {
      unsubServices();
      unsubBookings();
      unsubSheets();
      unsubLibrarySheets();
      unsubConfirmations();
      unsubRequests();
    };
  }, [authReady, user]);

  const activeBookingsCount = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.status === BookingStatus.AGENDADO ||
          b.status === BookingStatus.EM_ANDAMENTO
      ).length,
    [bookings]
  );

  const inProgressCount = useMemo(
    () => bookings.filter((b) => b.status === BookingStatus.EM_ANDAMENTO).length,
    [bookings]
  );

  const businessName = profile?.businessName || user?.displayName || 'PlanilhaFlow';
  const ownerWhatsapp = profile?.whatsappNumber || DEFAULT_OWNER_WHATSAPP;

  async function handleGoogleLogin() {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Não foi possível concluir o login com Google.'
      );
    }
  }

  async function handleLogout() {
    await signOut(auth);
  }

  // --- CRUD Handlers ---
  async function handleSaveService(
    data: Omit<ServiceItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
    editingId?: string
  ) {
    if (!user) return;
    if (editingId) {
      try {
        await updateDoc(doc(db, 'services', editingId), {
          ...data,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `services/${editingId}`);
      }
    } else {
      const newId = generateSafeId('srv');
      try {
        await setDoc(doc(db, 'services', newId), {
          ownerId: user.uid,
          ...data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `services/${newId}`);
      }
    }
  }

  async function handleDeleteService(serviceId: string) {
    try {
      await deleteDoc(doc(db, 'services', serviceId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `services/${serviceId}`);
    }
  }

  async function handleLoadStarterServices() {
    if (!user) return;
    const starters = [
      {
        name: 'Instalação e Manutenção Residencial',
        price: 180,
        category: 'Manutenção',
        durationMinutes: 90,
        description: 'Atendimento técnico completo no endereço do cliente.',
      },
      {
        name: 'Limpeza e Higienização Completa',
        price: 250,
        category: 'Limpeza',
        durationMinutes: 120,
        description: 'Serviço profissional detalhado com equipamentos próprios.',
      },
      {
        name: 'Consultoria Técnica Presencial',
        price: 150,
        category: 'Consultoria',
        durationMinutes: 60,
        description: 'Diagnóstico e plano de ação no local.',
      },
    ];
    for (const s of starters) {
      const id = generateSafeId('srv');
      await setDoc(doc(db, 'services', id), {
        ownerId: user.uid,
        ...s,
        autoConfirmMessageEnabled: true,
        confirmMessageTemplate: DEFAULT_CONFIRM_TEMPLATE,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  async function handleCreateBooking(input: {
    service: ServiceItem;
    clientName: string;
    clientPhone: string;
    serviceAddress: string;
    scheduledDate: string;
    scheduledTime: string;
    notes: string;
  }): Promise<Booking> {
    if (!user) throw new Error('Usuário não autenticado.');
    const bookingId = generateSafeId('ag');
    const confirmToken = generateSafeId('conf');

    const payload = {
      ownerId: user.uid,
      serviceId: input.service.id,
      serviceName: input.service.name.slice(0, SCHEMA_LIMITS.NAME_MAX),
      servicePrice: Number(input.service.price),
      clientName: input.clientName,
      clientPhone: input.clientPhone,
      serviceAddress: input.serviceAddress,
      scheduledDate: input.scheduledDate,
      scheduledTime: input.scheduledTime,
      notes: input.notes,
      status: BookingStatus.AGENDADO,
      confirmToken,
      whatsappConfirmedSent: false,
      whatsappOwnerNotified: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'bookings', bookingId), payload);
      batch.set(doc(db, 'confirmations', confirmToken), {
        bookingId,
        ownerId: user.uid,
        serviceName: payload.serviceName,
        servicePrice: payload.servicePrice,
        scheduledDate: payload.scheduledDate,
        scheduledTime: payload.scheduledTime,
        businessName: businessName.slice(0, SCHEMA_LIMITS.NAME_MAX),
        status: 'pendente',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `bookings/${bookingId}`);
    }

    return { id: bookingId, ...payload };
  }

  async function handleMarkWhatsAppSent(
    bookingId: string,
    field: 'whatsappConfirmedSent' | 'whatsappOwnerNotified'
  ) {
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        [field]: true,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${bookingId}`);
    }
  }

  async function handleStartService(booking: Booking) {
    try {
      await updateDoc(doc(db, 'bookings', booking.id), {
        status: BookingStatus.EM_ANDAMENTO,
        updatedAt: serverTimestamp(),
      });
      setActiveTab('atendimento');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${booking.id}`);
    }
  }

  async function handleCompleteService(booking: Booking) {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'bookings', booking.id), {
        status: BookingStatus.FINALIZADO,
        updatedAt: serverTimestamp(),
      });
      if (booking.confirmToken) {
        batch.update(doc(db, 'confirmations', booking.confirmToken), {
          status: 'finalizado',
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${booking.id}`);
    }
  }

  async function handleDeleteBooking(bookingId: string) {
    try {
      await deleteDoc(doc(db, 'bookings', bookingId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `bookings/${bookingId}`);
    }
  }

  async function handleCreateSpreadsheet(input: {
    title: string;
    segment: SpreadsheetSegment;
    groupBy: SpreadsheetGroupBy;
    description: string;
  }): Promise<string> {
    if (!user) return '';
    const id = generateSafeId('plan');
    try {
      await setDoc(doc(db, 'spreadsheets', id), {
        ownerId: user.uid,
        title: input.title,
        segment: input.segment,
        groupBy: input.groupBy,
        description: input.description,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `spreadsheets/${id}`);
    }
    return id;
  }

  async function handleDeleteSpreadsheet(sheetId: string) {
    try {
      await deleteDoc(doc(db, 'spreadsheets', sheetId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `spreadsheets/${sheetId}`);
    }
  }

  async function handleSaveSettings(newBusinessName: string, newWhatsapp: string) {
    if (!user) return;
    const sanitizedName = newBusinessName.trim().slice(0, SCHEMA_LIMITS.NAME_MAX) || 'Minha Empresa';
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        businessName: sanitizedName,
        whatsappNumber: newWhatsapp,
        updatedAt: serverTimestamp(),
      });

      const publicRef = doc(db, 'publicProfiles', user.uid);
      const publicSnap = await getDoc(publicRef);
      if (publicSnap.exists()) {
        await updateDoc(publicRef, {
          businessName: sanitizedName,
          active: true,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(publicRef, {
          uid: user.uid,
          businessName: sanitizedName,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setProfile((prev) =>
        prev
          ? { ...prev, businessName: sanitizedName, whatsappNumber: newWhatsapp }
          : prev
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  }

  function clearPublicRoute() {
    window.history.replaceState({}, '', window.location.pathname);
    setUrlParams({ confirmToken: '', confirmBookingId: '', publicAgendarOwner: '' });
  }

  // --- Public Client Confirmation Route (?confirmar=ID&token=TOKEN) ---
  if (urlParams.confirmToken) {
    return (
      <PublicConfirmationView
        confirmToken={urlParams.confirmToken}
        onBackToApp={clearPublicRoute}
      />
    );
  }

  // --- Public Client Booking Route (?agendar=OWNER_UID) ---
  if (urlParams.publicAgendarOwner) {
    return (
      <PublicBookingView
        ownerId={urlParams.publicAgendarOwner}
        onBackToApp={clearPublicRoute}
      />
    );
  }

  // --- Auth Loading ---
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm font-medium text-slate-600">Carregando sistema...</div>
      </div>
    );
  }

  // --- Unauthenticated Entry Screen ---
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Strict 3-Zone Top Bar */}
        <header className="border-b border-slate-200 bg-white">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
            <a
              href="/"
              className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            >
              PlanilhaFlow
            </a>
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <a
                href="#recursos"
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Planilhas
              </a>
              <a
                href="#agendamento"
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Agendamentos
              </a>
              <a
                href="#whatsapp"
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                WhatsApp
              </a>
              <a
                href="#confirmacao"
                className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Confirmação
              </a>
            </nav>
            <div className="shrink-0">
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Entrar com Google
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 lg:py-20 space-y-16">
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7 space-y-6">
              <h1
                className="font-display text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight leading-[1.12]"
                style={{ textWrap: 'balance' }}
              >
                Planilhas profissionais automáticas para quem vende serviços
              </h1>
              <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
                Cadastre seus serviços e valores, receba agendamentos com endereço detalhado, separe sua planilha automaticamente por serviço e por data, e envie tudo pelo WhatsApp com confirmação de conclusão pelo cliente.
              </p>

              {authError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {authError}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap min-h-[44px]"
                >
                  Acessar Painel com Google
                </button>
                <span className="text-xs text-slate-500">
                  WhatsApp configurado para pedidos: {formatPhoneDisplay(DEFAULT_OWNER_WHATSAPP)}
                </span>
              </div>
            </div>

            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <p className="text-xs font-semibold text-slate-500">
                Prévia da Planilha Automática
              </p>
              <div className="border-t border-slate-200 divide-y divide-slate-100 text-xs">
                <div className="py-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">Instalação Elétrica</p>
                    <p className="text-slate-500">18/11 · Rua das Palmeiras, 420</p>
                  </div>
                  <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                    R$ 220,00
                  </span>
                </div>
                <div className="py-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">Manutenção Preventiva</p>
                    <p className="text-slate-500">19/11 · Av. Brasil, 1180</p>
                  </div>
                  <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                    R$ 180,00
                  </span>
                </div>
                <div className="py-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">Consultoria no Local</p>
                    <p className="text-slate-500">20/11 · Centro, Sala 302</p>
                  </div>
                  <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                    R$ 150,00
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section
            id="recursos"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 border-t border-slate-200 pt-10"
          >
            <div id="agendamento" className="space-y-1.5">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                01. Serviços e Agendamento
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Cadastre serviços com valor e mensagem de &ldquo;Agendamento Confirmado&rdquo;. O cliente escolhe data, informa o endereço e salva na planilha.
              </p>
            </div>
            <div className="space-y-1.5">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                02. Separação Automática
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Organize por serviço ou por data automaticamente, exporte Excel (.xlsx) com abas separadas e crie planilhas para empresa ou autônomo.
              </p>
            </div>
            <div id="whatsapp" className="space-y-1.5">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                03. Integração WhatsApp
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Envie a planilha pronta no WhatsApp para o cliente ou receba cada pedido detalhado direto no seu WhatsApp.
              </p>
            </div>
            <div id="confirmacao" className="space-y-1.5">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                04. Confirmação de Saída
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Durante o atendimento, envie ao cliente o link para confirmar que o serviço terminou. Ao confirmar, sai da planilha ativa automaticamente.
              </p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // --- Authenticated SaaS Workspace ---
  const navItems: { id: NavTab; label: string; icon: React.ReactNode; count?: number }[] = [
    {
      id: 'planilha',
      label: 'Planilha Automática',
      icon: <Table2 className="w-4 h-4" />,
      count: activeBookingsCount,
    },
    {
      id: 'atendimento',
      label: 'Em Atendimento',
      icon: <PlayCircle className="w-4 h-4" />,
      count: inProgressCount > 0 ? inProgressCount : undefined,
    },
    {
      id: 'agendar',
      label: 'Agendar Serviço',
      icon: <CalendarPlus className="w-4 h-4" />,
    },
    {
      id: 'servicos',
      label: 'Meus Serviços',
      icon: <Wrench className="w-4 h-4" />,
      count: services.length,
    },
    {
      id: 'personalizadas',
      label: 'Planilhas Profissionais',
      icon: <FileSpreadsheet className="w-4 h-4" />,
    },
    {
      id: 'biblioteca',
      label: 'Biblioteca com IA',
      icon: <FolderOpen className="w-4 h-4" />,
      count: librarySheets.length > 0 ? librarySheets.length : undefined,
    },
    {
      id: 'historico',
      label: 'Histórico Concluídos',
      icon: <History className="w-4 h-4" />,
    },
    {
      id: 'configuracoes',
      label: 'Configurações',
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-r border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2.5">
          <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0" />
          <span className="font-display font-bold text-lg tracking-tight text-slate-900 whitespace-nowrap">
            PlanilhaFlow
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  active
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.count === 'number' && (
                  <span className="text-xs font-mono tabular-nums text-slate-400">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">{businessName}</p>
            <p className="text-[11px] font-mono text-slate-500 truncate">
              WhatsApp: {formatPhoneDisplay(ownerWhatsapp)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair da Conta
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col border-r border-slate-200">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <span className="font-display font-bold text-lg text-slate-900">
                PlanilhaFlow
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-left ${
                    activeTab === item.id
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  {typeof item.count === 'number' && (
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      {item.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
            <div className="p-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sair
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header Contract: Breadcrumbs left, max 1-2 single-line primary actions right */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-lg"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                {businessName}
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {NAV_LABELS[activeTab]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {activeTab !== 'atendimento' && inProgressCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('atendimento')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                Ver Atendimento Atual
              </button>
            )}
            {activeTab !== 'agendar' && (
              <button
                type="button"
                onClick={() => setActiveTab('agendar')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                Novo Agendamento
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {activeTab === 'planilha' && (
            <SpreadsheetView
              bookings={bookings}
              services={services}
              loading={loadingData}
              businessName={businessName}
              ownerWhatsapp={ownerWhatsapp}
              onStartService={handleStartService}
              onCompleteService={handleCompleteService}
              onNavigateToBooking={() => setActiveTab('agendar')}
            />
          )}

          {activeTab === 'atendimento' && (
            <ExecutionView
              bookings={bookings}
              businessName={businessName}
              onStartService={handleStartService}
              onCompleteService={handleCompleteService}
              onPreviewClientConfirmation={(bookingId, token) =>
                setUrlParams({
                  confirmBookingId: bookingId,
                  confirmToken: token,
                  publicAgendarOwner: '',
                })
              }
            />
          )}

          {activeTab === 'agendar' && (
            <BookingManagerView
              ownerId={user.uid}
              businessName={businessName}
              ownerWhatsapp={ownerWhatsapp}
              services={services}
              onCreateBooking={handleCreateBooking}
              onMarkWhatsAppSent={handleMarkWhatsAppSent}
              onNavigateToServices={() => setActiveTab('servicos')}
              onOpenPublicBooking={() =>
                setUrlParams({
                  confirmBookingId: '',
                  confirmToken: '',
                  publicAgendarOwner: user.uid,
                })
              }
            />
          )}

          {activeTab === 'servicos' && (
            <ServicesView
              services={services}
              loading={loadingData}
              onSaveService={handleSaveService}
              onDeleteService={handleDeleteService}
              onLoadStarterServices={handleLoadStarterServices}
            />
          )}

          {activeTab === 'personalizadas' && (
            <CustomSpreadsheetsView
              ownerId={user.uid}
              ownerWhatsapp={ownerWhatsapp}
              spreadsheets={spreadsheets}
              onCreateSpreadsheet={handleCreateSpreadsheet}
              onDeleteSpreadsheet={handleDeleteSpreadsheet}
            />
          )}

          {activeTab === 'biblioteca' && (
            <LibraryView
              ownerId={user.uid}
              ownerWhatsapp={ownerWhatsapp}
              sheets={librarySheets}
              loading={loadingData}
            />
          )}

          {activeTab === 'historico' && (
            <HistoryView bookings={bookings} onDeleteBooking={handleDeleteBooking} />
          )}

          {activeTab === 'configuracoes' && (
            <SettingsView
              ownerId={user.uid}
              businessName={businessName}
              whatsappNumber={ownerWhatsapp}
              email={user.email || ''}
              onSaveSettings={handleSaveSettings}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppWorkspace />
    </ErrorBoundary>
  );
}
