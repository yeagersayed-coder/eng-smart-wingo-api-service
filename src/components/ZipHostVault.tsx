import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Shield,
  Upload,
  Archive,
  Download,
  Trash2,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  FileCode,
  CheckCircle,
  AlertCircle,
  Eye,
  Lock,
  Layers,
  FolderArchive,
  Key,
  Cloud,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  OperationType,
  sanitizeFirestoreId,
  truncateString,
} from '../firebase.js';
import { useFirebase } from '../contexts/FirebaseContext.js';

interface HostedSiteFile {
  path: string;
  size: number;
  isDecoy: boolean;
}

interface HostedSite {
  siteId: string;
  title: string;
  accessKey?: string;
  originalSize: number;
  protectedSize: number;
  fileCount: number;
  decoyCount: number;
  liveUrl: string;
  createdAt: number;
  files: HostedSiteFile[];
}

export default function ZipHostVault() {
  const { user, authReady, profileSynced } = useFirebase();
  const [sites, setSites] = useState<HostedSite[]>([]);
  const [cloudSites, setCloudSites] = useState<HostedSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [siteTitle, setSiteTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
  const [progress, setProgress] = useState(0);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Inspector modal
  const [inspectSite, setInspectSite] = useState<HostedSite | null>(null);
  const [inspectFiles, setInspectFiles] = useState<HostedSiteFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'decoys' | 'user'>('all');

  // Toast
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, message });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  };

  const getGodModeKey = (site: HostedSite): string => {
    if (site.accessKey) return site.accessKey;
    const raw = site.siteId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().padEnd(12, 'X');
    return `GMV3-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  };

  // Real-time Firestore listener for vault deployments
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || !profileSynced) {
      setCloudSites([]);
      return;
    }

    const uid = sanitizeFirestoreId(user.uid, 'user_default', 128);
    const colPath = `users/${uid}/vault_deployments`;
    const q = query(collection(db, 'users', uid, 'vault_deployments'), where('ownerId', '==', uid), limit(50));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: HostedSite[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            siteId: String(d.siteId || docSnap.id),
            title: String(d.title || 'Protected Site'),
            accessKey: String(d.accessKey || ''),
            originalSize: Number(d.originalSize) || 0,
            protectedSize: Number(d.protectedSize) || 0,
            fileCount: Number(d.fileCount) || 1,
            decoyCount: Number(d.decoyCount) || 0,
            liveUrl: String(d.liveUrl || `/site/${docSnap.id}/index.html`),
            createdAt: d.createdAt?.toMillis?.() ?? Date.now(),
            files: [],
          };
        });
        setCloudSites(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, colPath);
      }
    );

    return () => unsub();
  }, [authReady, user, profileSynced]);

  const fetchSites = async () => {
    try {
      const res = await fetch('/api/zip-host/sites');
      const data = await res.json();
      if (data.sites) setSites(data.sites);
    } catch {
      showToast('Error fetching hosted sites', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  const mergedSites = useMemo(() => {
    const map = new Map<string, HostedSite & { isCloudSynced?: boolean }>();
    cloudSites.forEach((cs) => {
      map.set(cs.siteId, { ...cs, isCloudSynced: true });
    });
    sites.forEach((ls) => {
      const wasCloud = map.has(ls.siteId);
      map.set(ls.siteId, { ...ls, isCloudSynced: wasCloud });
    });
    return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [sites, cloudSites]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.toLowerCase().endsWith('.zip')) {
        showToast('Please select a valid .ZIP file.', 'error');
        return;
      }
      setSelectedFile(file);
      if (!siteTitle) {
        setSiteTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.name.toLowerCase().endsWith('.zip')) {
        showToast('Please drop a valid .ZIP file.', 'error');
        return;
      }
      setSelectedFile(file);
      if (!siteTitle) {
        setSiteTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      showToast('Please select or drop a .zip file first!', 'error');
      return;
    }

    setUploading(true);
    setProgress(15);
    setUploadStep('Reading ZIP archive package...');

    try {
      await new Promise((r) => setTimeout(r, 400));
      setProgress(40);
      setUploadStep('Extracting website structure & parsing assets...');

      await new Promise((r) => setTimeout(r, 400));
      setProgress(70);
      setUploadStep('Generating 120+ Decoy / Junk files in root and subfolders...');

      await new Promise((r) => setTimeout(r, 400));
      setProgress(90);
      setUploadStep('Obfuscating JavaScript source code & applying Anti-F12 Shield...');

      const formData = new FormData();
      formData.append('zipFile', selectedFile);
      formData.append('title', siteTitle || selectedFile.name.replace(/\.[^/.]+$/, ''));

      const res = await fetch('/api/zip-host/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        if (authReady && user && user.emailVerified && profileSynced && data.site) {
          const uploadedSite: HostedSite = data.site;
          const uid = sanitizeFirestoreId(user.uid, 'user_default', 128);
          const safeSiteId = sanitizeFirestoreId(uploadedSite.siteId, 'site_001', 64);
          const docPath = `users/${uid}/vault_deployments/${safeSiteId}`;
          const validKey = /^GMV3-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(uploadedSite.accessKey || '')
            ? uploadedSite.accessKey!
            : getGodModeKey(uploadedSite);
          const origSize = Math.max(0, Number(uploadedSite.originalSize) || 0);
          const protSize = Math.max(origSize, Number(uploadedSite.protectedSize) || origSize);
          try {
            await setDoc(doc(db, 'users', uid, 'vault_deployments', safeSiteId), {
              ownerId: uid,
              siteId: safeSiteId,
              title: truncateString(uploadedSite.title, 120, 'Protected Site'),
              accessKey: validKey,
              originalSize: origSize,
              protectedSize: protSize,
              fileCount: Math.max(1, Math.min(50000, Number(uploadedSite.fileCount) || 1)),
              decoyCount: Math.max(0, Math.min(50000, Number(uploadedSite.decoyCount) || 0)),
              liveUrl: truncateString(uploadedSite.liveUrl, 256, `/site/${safeSiteId}/index.html`),
              status: 'PROTECTED',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } catch (fsErr) {
            handleFirestoreError(fsErr, OperationType.CREATE, docPath);
          }
        }
        setProgress(100);
        setUploadStep('Deploying protected live website URL...');
        await new Promise((r) => setTimeout(r, 300));
        showToast('Website hosted with GOD_MODE anti-steal protection!');
        setSelectedFile(null);
        setSiteTitle('');
        await fetchSites();
      } else {
        throw new Error(data.error || 'Failed to host website');
      }
    } catch (err: any) {
      showToast(err.message || 'Upload error', 'error');
    } finally {
      setUploading(false);
      setUploadStep('');
      setProgress(0);
    }
  };

  const handleDelete = async (siteId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete hosted site "${title}"?`)) return;

    try {
      const res = await fetch(`/api/zip-host/site/${siteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (authReady && user && user.emailVerified && profileSynced) {
        const uid = sanitizeFirestoreId(user.uid, 'user_default', 128);
        const safeSiteId = sanitizeFirestoreId(siteId, 'site_001', 64);
        const docPath = `users/${uid}/vault_deployments/${safeSiteId}`;
        try {
          await deleteDoc(doc(db, 'users', uid, 'vault_deployments', safeSiteId));
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.DELETE, docPath);
        }
      }
      if (data.success || cloudSites.some((c) => c.siteId === siteId)) {
        showToast(`Deleted hosted site "${title}".`);
        if (inspectSite?.siteId === siteId) {
          setInspectSite(null);
        }
        await fetchSites();
      }
    } catch {
      showToast('Failed to delete site.', 'error');
    }
  };

  const handleReprotect = async (siteId: string) => {
    try {
      showToast('Adding additional scrambled decoy files...', 'info');
      const res = await fetch(`/api/zip-host/reprotect/${siteId}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        if (authReady && user && user.emailVerified && profileSynced && data.site && cloudSites.some((c) => c.siteId === siteId)) {
          const updatedSite: HostedSite = data.site;
          const uid = sanitizeFirestoreId(user.uid, 'user_default', 128);
          const safeSiteId = sanitizeFirestoreId(siteId, 'site_001', 64);
          const docPath = `users/${uid}/vault_deployments/${safeSiteId}`;
          const origSize = Math.max(0, Number(updatedSite.originalSize) || 0);
          const protSize = Math.max(origSize, Number(updatedSite.protectedSize) || origSize);
          try {
            await updateDoc(doc(db, 'users', uid, 'vault_deployments', safeSiteId), {
              protectedSize: protSize,
              fileCount: Math.max(1, Math.min(50000, Number(updatedSite.fileCount) || 1)),
              decoyCount: Math.max(0, Math.min(50000, Number(updatedSite.decoyCount) || 0)),
              updatedAt: serverTimestamp(),
            });
          } catch (fsErr) {
            handleFirestoreError(fsErr, OperationType.UPDATE, docPath);
          }
        }
        showToast('+120 More Decoy files injected successfully!');
        await fetchSites();
        if (inspectSite?.siteId === siteId) {
          openInspector(inspectSite);
        }
      }
    } catch {
      showToast('Failed to refresh protection.', 'error');
    }
  };

  const openInspector = async (site: HostedSite) => {
    setInspectSite(site);
    setLoadingFiles(true);
    try {
      const res = await fetch(`/api/zip-host/files/${site.siteId}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.files)) {
        setInspectFiles(data.files);
      } else {
        setInspectFiles([]);
      }
    } catch {
      showToast('Failed to load site file list.', 'error');
    } finally {
      setLoadingFiles(false);
    }
  };

  const copyLiveUrl = (url: string, id: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const full = `${origin}${url}`;
    navigator.clipboard.writeText(full);
    setCopiedId(id);
    showToast('Live URL copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyAccessKey = async (accessKey: string, id: string) => {
    try {
      await navigator.clipboard.writeText(accessKey);
      setCopiedKeyId(id);
      showToast(`God-Mode access key (${accessKey}) copied to clipboard!`);
      setTimeout(() => setCopiedKeyId((prev) => (prev === id ? null : prev)), 2000);
    } catch {
      showToast('Failed to copy access key to clipboard.', 'error');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const filteredInspectorFiles = inspectFiles.filter((f) => {
    if (filterType === 'decoys') return f.isDecoy;
    if (filterType === 'user') return !f.isDecoy;
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 p-4 rounded-xl border backdrop-blur-lg flex items-center gap-2 shadow-2xl bg-slate-950/95 border-amber-500/50 text-amber-300 font-mono text-xs">
          <Shield className="w-4 h-4 text-amber-400" />
          {toast.message}
        </div>
      )}

      {/* Hero Header */}
      <div className="bg-[#080815] border border-slate-800/80 rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400">
                GOD-MODE ANTI-STEAL ENGINE ACTIVE
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              Zip Host &amp; Anti-Steal Vault
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl font-sans">
              Upload any static website zip archive. The engine automatically unzips it, injects 120+ Decoy / Junk files to confuse scrapers and clone tools, embeds an Anti-F12 / Anti-DevTools shield, and deploys it to a permanent live URL.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-amber-950/80 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              Anti-DevTools Shield v3
            </span>
            <a
              href="/api/project-export/edgeone-zip"
              download="famapp-wingo-edgeone-clean.zip"
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-indigo-600/20"
            >
              <Download className="w-3.5 h-3.5" />
              Export Clean EdgeOne ZIP
            </a>
          </div>
        </div>
      </div>

      {/* Upload Box */}
      <div className="bg-[#090e1c] border border-slate-800 rounded-2xl p-6">
        <form onSubmit={handleUpload} className="space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-slate-800 hover:border-amber-500/50 rounded-2xl p-8 text-center transition cursor-pointer bg-slate-950/40 relative"
          >
            <input
              type="file"
              accept=".zip"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="p-4 bg-amber-500/10 rounded-2xl text-amber-400">
                <FolderArchive className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">
                  {selectedFile ? selectedFile.name : 'Click to select or drag and drop a .ZIP website archive'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supports standard website zip archives up to 100MB
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <input
              type="text"
              placeholder="Site / Project Title (e.g., Color Predictor Web App)"
              value={siteTitle}
              onChange={(e) => setSiteTitle(e.target.value)}
              className="w-full sm:flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-amber-500 to-indigo-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Processing Protection...
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Host Protected Website
                </>
              )}
            </button>
          </div>

          {/* Progress bar during upload */}
          {uploading && (
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span className="text-amber-300 font-bold">{uploadStep}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 via-indigo-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Hosted Sites List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-mono font-bold text-white uppercase flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            Hosted Protected Sites ({mergedSites.length})
            {user && profileSynced && (
              <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold flex items-center gap-1 normal-case">
                <Cloud className="w-3 h-3" />
                Firestore Synced ({cloudSites.length})
              </span>
            )}
          </h3>
          <span className="text-xs font-mono text-slate-500">Auto-Obfuscated &amp; Sandboxed</span>
        </div>

        {mergedSites.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {mergedSites.map((site) => (
              <div
                key={site.siteId}
                className="bg-[#090e1c] border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-bold text-white">{site.title}</h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-500/30">
                        GOD-MODE PROTECTED
                      </span>
                      {site.isCloudSynced && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <Cloud className="w-3 h-3" />
                          FIRESTORE
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-slate-400">
                      <span>ID: {site.siteId}</span>
                      <span>Original: {formatBytes(site.originalSize)}</span>
                      <span className="text-amber-300 font-bold">
                        Protected: {formatBytes(site.protectedSize)} (+{site.decoyCount} Decoys)
                      </span>
                      <span>Total Files: {site.fileCount}</span>
                    </div>
                    <div className="pt-1.5 flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950 border border-amber-500/30 font-mono text-[11px]">
                        <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-slate-400">God-Mode Key:</span>
                        <code className="text-amber-300 font-bold tracking-wider select-all">
                          {getGodModeKey(site)}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyAccessKey(getGodModeKey(site), site.siteId)}
                        className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded-lg text-[11px] font-bold font-mono flex items-center gap-1.5 transition cursor-pointer"
                        title="Copy God-Mode Access Key to Clipboard"
                      >
                        {copiedKeyId === site.siteId ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            Copied Key!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copy to Clipboard
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={site.liveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-600/20"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Live Preview
                    </a>

                    <button
                      onClick={() => copyLiveUrl(site.liveUrl, site.siteId)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedId === site.siteId ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy URL
                        </>
                      )}
                    </button>

                    <a
                      href={`/api/zip-host/download-protected/${site.siteId}`}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 cursor-pointer"
                      title="Download full zip with all 120+ decoys injected"
                    >
                      <Download className="w-3.5 h-3.5 text-indigo-400" />
                      Download Protected ZIP
                    </a>

                    <button
                      onClick={() => handleReprotect(site.siteId)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 cursor-pointer"
                      title="Inject +120 more scrambled decoy files"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                      Reprotect (+120 Decoys)
                    </button>

                    <button
                      onClick={() => openInspector(site)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Inspect Files
                    </button>

                    <button
                      onClick={() => handleDelete(site.siteId, site.title)}
                      className="p-1.5 hover:bg-rose-950/40 text-slate-500 hover:text-rose-400 rounded-lg transition cursor-pointer"
                      title="Delete site"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#090e1c] border border-slate-800 rounded-2xl p-12 text-center text-slate-500 font-mono text-xs">
            No hosted sites uploaded yet. Select a .ZIP file above to generate your first protected deployment!
          </div>
        )}
      </div>

      {/* FILE INSPECTOR MODAL */}
      {inspectSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0d1322] border border-slate-800 rounded-2xl p-6 max-w-2xl w-full space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white font-mono uppercase">
                  Archive File Tree &amp; Decoy Inspector: {inspectSite.title}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                  <span>
                    {inspectFiles.length} files total ({inspectFiles.filter((f) => f.isDecoy).length} decoys injected)
                  </span>
                  <span className="text-slate-700">•</span>
                  <span className="text-amber-300 font-bold">Key: {getGodModeKey(inspectSite)}</span>
                  <button
                    type="button"
                    onClick={() => copyAccessKey(getGodModeKey(inspectSite), `modal_${inspectSite.siteId}`)}
                    className="px-2 py-0.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 rounded text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKeyId === `modal_${inspectSite.siteId}` ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy Key
                      </>
                    )}
                  </button>
                </div>
              </div>
              <button
                onClick={() => setInspectSite(null)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                  filterType === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                All Files ({inspectFiles.length})
              </button>
              <button
                onClick={() => setFilterType('decoys')}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                  filterType === 'decoys' ? 'bg-amber-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                Decoys ({inspectFiles.filter((f) => f.isDecoy).length})
              </button>
              <button
                onClick={() => setFilterType('user')}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                  filterType === 'user' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                Source / Entry ({inspectFiles.filter((f) => !f.isDecoy).length})
              </button>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-xs pr-1">
              {loadingFiles ? (
                <div className="py-12 text-center text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-400 mx-auto mb-2" />
                  Loading file tree...
                </div>
              ) : filteredInspectorFiles.length > 0 ? (
                filteredInspectorFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-900 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileCode
                        className={`w-3.5 h-3.5 shrink-0 ${file.isDecoy ? 'text-amber-400/60' : 'text-emerald-400'}`}
                      />
                      <span
                        className={`truncate ${file.isDecoy ? 'text-slate-400 text-[11px]' : 'text-slate-200 font-bold'}`}
                      >
                        {file.path}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] text-slate-500">{formatBytes(file.size)}</span>
                      {file.isDecoy ? (
                        <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-amber-950/60 text-amber-300 border border-amber-500/20">
                          DECOY
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/20">
                          SOURCE
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-slate-500">No files found.</div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-400">
              <span>All files are bundled in the Live Protected Host &amp; Protected ZIP</span>
              <button
                onClick={() => setInspectSite(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
