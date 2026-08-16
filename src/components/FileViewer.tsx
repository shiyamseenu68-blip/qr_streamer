import React, { useEffect, useState, useRef } from 'react';
import { 
  Download, 
  Share2, 
  Clock, 
  FileText, 
  Image as ImageIcon, 
  Video, 
  Music, 
  FileArchive, 
  File as FileIcon, 
  ShieldAlert, 
  Loader2, 
  AlertCircle, 
  Copy, 
  Check, 
  Eye,
  Maximize2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { FileMetadata } from '../types';
import { formatBytes, formatDate, getTimeRemaining, getCategoryBadgeColor } from '../utils/fileHelper';

interface FileViewerProps {
  fileId: string;
  onGoHome: () => void;
}

export const FileViewer: React.FC<FileViewerProps> = ({ fileId, onGoHome }) => {
  const [file, setFile] = useState<FileMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // Audio Player State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(1);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Video Player Ref
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchFileInfo() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/${fileId}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'File not found');
        }
        const data: FileMetadata & { isLimitReached?: boolean } = await res.json();
        if (isMounted) {
          setFile(data);
          if (!data.requireConfirmation) {
            setConfirmed(true);
          }
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Error loading file');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchFileInfo();
    return () => {
      isMounted = false;
    };
  }, [fileId]);

  // Fetch text content if file category is 'text'
  useEffect(() => {
    if (file && file.category === 'text' && confirmed && !file.isExpired && !file.isDeleted) {
      setLoadingText(true);
      fetch(`/api/${file.id}/raw`)
        .then((res) => res.text())
        .then((text) => setTextContent(text))
        .catch((err) => console.error('Error fetching text file:', err))
        .finally(() => setLoadingText(false));
    }
  }, [file, confirmed]);

  const rawFileUrl = `/api/${fileId}/raw`;
  const downloadUrl = `/api/${fileId}/raw?download=true`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShare = async () => {
    if (!file) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: file.originalName,
          text: `View and download ${file.originalName} via QRVault`,
          url: window.location.href,
        });
      } catch (e) {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  // Audio Controls Helpers
  const toggleAudioPlay = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setAudioCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration);
    }
  };

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setAudioCurrentTime(time);
    }
  };

  const handleAudioVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setAudioVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
      setIsAudioMuted(vol === 0);
    }
  };

  const toggleAudioMute = () => {
    if (audioRef.current) {
      const nextMuted = !isAudioMuted;
      setIsAudioMuted(nextMuted);
      audioRef.current.muted = nextMuted;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleFullscreenVideo = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if ((videoRef.current as any).webkitRequestFullscreen) {
        (videoRef.current as any).webkitRequestFullscreen();
      }
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-xl mx-auto px-4 py-20 text-center">
        <div className="bg-[#0A0A0C] border border-[#1F1F23] rounded-3xl p-12 shadow-2xl">
          <Loader2 className="w-10 h-10 text-[#FF007A] animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-1">Locating Vault Record...</h3>
          <p className="text-xs text-[#A1A1AA] font-mono">Loading original media payload for {fileId}</p>
        </div>
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="w-full max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-[#0A0A0C] border border-[#1F1F23] rounded-3xl p-8 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">FILE NOT FOUND</h2>
          <p className="text-[#A1A1AA] text-sm mb-6">
            {error || 'This file link is invalid or no longer exists on QRVault.'}
          </p>
          <button
            onClick={onGoHome}
            className="px-6 py-3 rounded-xl font-bold text-sm bg-[#18181B] hover:bg-[#27272A] text-white transition-colors border border-[#27272A]"
          >
            Go to QRVault Homepage
          </button>
        </div>
      </div>
    );
  }

  if (file.isDeleted) {
    return (
      <div className="w-full max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-[#0A0A0C] border border-[#1F1F23] rounded-3xl p-8 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">FILE NO LONGER AVAILABLE</h2>
          <p className="text-[#A1A1AA] text-sm mb-6">
            The owner has permanently deleted this shared file from the vault.
          </p>
          <button
            onClick={onGoHome}
            className="px-6 py-3 rounded-xl font-bold text-sm bg-[#18181B] hover:bg-[#27272A] text-white transition-colors border border-[#27272A]"
          >
            Go to QRVault Homepage
          </button>
        </div>
      </div>
    );
  }

  if (file.isExpired) {
    return (
      <div className="w-full max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-[#0A0A0C] border border-[#1F1F23] rounded-3xl p-8 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">THIS FILE HAS EXPIRED</h2>
          <p className="text-[#A1A1AA] text-sm mb-6">
            This file had an auto-expiration policy that has elapsed. The content is no longer accessible.
          </p>
          <button
            onClick={onGoHome}
            className="px-6 py-3 rounded-xl font-bold text-sm bg-[#18181B] hover:bg-[#27272A] text-white transition-colors border border-[#27272A]"
          >
            Go to QRVault Homepage
          </button>
        </div>
      </div>
    );
  }

  const isLimitReached = file.downloadLimit !== null && file.downloadCount >= file.downloadLimit;
  if (isLimitReached) {
    return (
      <div className="w-full max-w-lg mx-auto px-4 py-16 text-center">
        <div className="bg-[#0A0A0C] border border-[#1F1F23] rounded-3xl p-8 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-[#7D40FF]/10 border border-[#7D40FF]/20 text-[#7D40FF] flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">DOWNLOAD LIMIT REACHED</h2>
          <p className="text-[#A1A1AA] text-sm mb-6">
            This file has reached its maximum configured download allowance ({file.downloadLimit} downloads).
          </p>
          <button
            onClick={onGoHome}
            className="px-6 py-3 rounded-xl font-bold text-sm bg-[#18181B] hover:bg-[#27272A] text-white transition-colors border border-[#27272A]"
          >
            Go to QRVault Homepage
          </button>
        </div>
      </div>
    );
  }

  // Confirmation Required Guard
  if (file.requireConfirmation && !confirmed) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-16 text-center">
        <div className="bg-[#0A0A0C] border border-[#1F1F23] rounded-3xl p-8 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-[#FF007A]/10 border border-[#FF007A]/20 text-[#FF007A] flex items-center justify-center mx-auto mb-4">
            <Eye className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Owner Confirmation Required</h2>
          <p className="text-[#A1A1AA] text-xs mb-6 leading-relaxed">
            The owner of <span className="text-[#FF007A] font-semibold">{file.originalName}</span> requires confirmation before displaying or downloading this file payload.
          </p>
          <button
            onClick={() => setConfirmed(true)}
            className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#FF007A] to-[#7D40FF] text-white shadow-lg shadow-[#FF007A]/20 hover:opacity-90 active:scale-95 transition-all min-h-[46px]"
          >
            Confirm & View Original File
          </button>
        </div>
      </div>
    );
  }

  const badgeColors = getCategoryBadgeColor(file.category);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 sm:py-12">
      {/* Top Banner Card */}
      <div className="bg-[#0A0A0C] border border-[#1F1F23] rounded-3xl p-5 sm:p-6 mb-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-[#1F1F23]">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-[#18181B] border border-[#27272A] flex items-center justify-center flex-shrink-0 shadow-inner">
              {file.category === 'image' && <ImageIcon className="w-7 h-7 text-[#FF007A]" />}
              {file.category === 'video' && <Video className="w-7 h-7 text-[#7D40FF]" />}
              {file.category === 'audio' && <Music className="w-7 h-7 text-indigo-400" />}
              {(file.category === 'pdf' || file.category === 'text' || file.category === 'document') && (
                <FileText className="w-7 h-7 text-blue-400" />
              )}
              {file.category === 'archive' && <FileArchive className="w-7 h-7 text-amber-400" />}
              {file.category === 'other' && <FileIcon className="w-7 h-7 text-slate-400" />}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-white truncate" title={file.originalName}>
                {file.originalName}
              </h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-[#A1A1AA] mt-1 font-medium">
                <span className={`px-2 py-0.5 rounded font-mono text-[10px] uppercase font-bold border ${badgeColors.bg} ${badgeColors.text} ${badgeColors.border}`}>
                  {file.category}
                </span>
                <span>•</span>
                <span className="font-mono text-white font-semibold">{formatBytes(file.size)}</span>
                <span className="hidden xs:inline">•</span>
                <span className="hidden xs:inline">Uploaded {formatDate(file.createdAt)}</span>
              </div>
            </div>
          </div>

          <a
            href={downloadUrl}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#FF007A] to-[#7D40FF] text-white shadow-lg shadow-[#FF007A]/20 hover:opacity-90 active:scale-95 transition-all flex-shrink-0 min-h-[46px]"
          >
            <Download className="w-4 h-4" />
            Download Original File
          </a>
        </div>

        {/* Action Toolbar on Mobile & Desktop */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-xs text-[#A1A1AA]">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-[#FF007A]" />
            <span>{getTimeRemaining(file.expiresAt)}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white transition-colors border border-[#27272A] font-semibold min-h-[38px]"
            >
              <Share2 className="w-3.5 h-3.5 text-[#FF007A]" />
              <span>Share</span>
            </button>
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white transition-colors border border-[#27272A] font-semibold min-h-[38px]"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#7D40FF]" />}
              <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="bg-[#0A0A0C] border border-[#1F1F23] rounded-3xl p-4 sm:p-6 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold text-[#A1A1AA] uppercase tracking-wider">
            Original File Preview
          </h2>
          <span className="text-[11px] font-mono text-[#71717A]">
            Direct Vault Stream
          </span>
        </div>

        {/* 1. IMAGE PREVIEW */}
        {file.category === 'image' && (
          <div className="space-y-4">
            <div className="relative group bg-[#050505] rounded-2xl overflow-hidden border border-[#27272A] flex items-center justify-center min-h-[320px] max-h-[700px] p-2">
              <img
                src={rawFileUrl}
                alt={file.originalName}
                className="max-h-[650px] w-auto max-w-full object-contain cursor-zoom-in rounded-xl"
                onClick={() => setIsZoomed(true)}
              />
              <button
                onClick={() => setIsZoomed(true)}
                className="absolute top-4 right-4 p-2.5 bg-black/75 hover:bg-black/95 rounded-xl text-white backdrop-blur-md transition-all opacity-90 sm:opacity-0 sm:group-hover:opacity-100 min-h-[44px] min-w-[44px] flex items-center justify-center border border-white/10"
                title="Fullscreen Image"
              >
                <Maximize2 className="w-5 h-5 text-[#FF007A]" />
              </button>
            </div>

            {/* Image Action Bar */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <a
                href={downloadUrl}
                className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-[#FF007A] to-[#7D40FF] text-white shadow-md shadow-[#FF007A]/20 min-h-[44px]"
              >
                <Download className="w-4 h-4" />
                Download Original Image
              </a>
              <button
                onClick={() => setIsZoomed(true)}
                className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-[#18181B] hover:bg-[#27272A] text-white border border-[#27272A] transition-colors min-h-[44px]"
              >
                <Maximize2 className="w-4 h-4 text-[#FF007A]" />
                Fullscreen
              </button>
              <button
                onClick={handleShare}
                className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-[#18181B] hover:bg-[#27272A] text-white border border-[#27272A] transition-colors min-h-[44px]"
              >
                <Share2 className="w-4 h-4 text-[#7D40FF]" />
                Share
              </button>
            </div>

            {/* Fullscreen Lightbox Modal */}
            {isZoomed && (
              <div
                className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
                onClick={() => setIsZoomed(false)}
              >
                <img
                  src={rawFileUrl}
                  alt={file.originalName}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                />
                <button
                  onClick={() => setIsZoomed(false)}
                  className="absolute top-6 right-6 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs backdrop-blur-md border border-white/20"
                >
                  Close (ESC)
                </button>
              </div>
            )}
          </div>
        )}

        {/* 2. VIDEO PREVIEW */}
        {file.category === 'video' && (
          <div className="space-y-4">
            <div className="bg-[#050505] rounded-2xl overflow-hidden border border-[#27272A] shadow-inner">
              <video
                ref={videoRef}
                controls
                playsInline
                preload="metadata"
                src={rawFileUrl}
                className="w-full max-h-[600px] rounded-2xl bg-black"
              />
            </div>

            {/* Video Action Controls */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <a
                href={downloadUrl}
                className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-[#FF007A] to-[#7D40FF] text-white shadow-md shadow-[#FF007A]/20 min-h-[44px]"
              >
                <Download className="w-4 h-4" />
                Download Original Video
              </a>
              <button
                onClick={handleFullscreenVideo}
                className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-[#18181B] hover:bg-[#27272A] text-white border border-[#27272A] transition-colors min-h-[44px]"
              >
                <Maximize2 className="w-4 h-4 text-[#7D40FF]" />
                Fullscreen
              </button>
              <button
                onClick={handleShare}
                className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-[#18181B] hover:bg-[#27272A] text-white border border-[#27272A] transition-colors min-h-[44px]"
              >
                <Share2 className="w-4 h-4 text-[#FF007A]" />
                Share
              </button>
            </div>
          </div>
        )}

        {/* 3. AUDIO PREVIEW */}
        {file.category === 'audio' && (
          <div className="space-y-4">
            <div className="bg-[#050505] p-6 sm:p-8 rounded-2xl border border-[#27272A] flex flex-col items-center justify-center text-center">
              {/* Hidden Native Audio Element */}
              <audio
                ref={audioRef}
                src={rawFileUrl}
                preload="metadata"
                onTimeUpdate={handleAudioTimeUpdate}
                onLoadedMetadata={handleAudioLoadedMetadata}
                onEnded={() => setIsPlayingAudio(false)}
              />

              {/* Animated Music Badge */}
              <div className="w-24 h-24 rounded-3xl bg-[#18181B] border border-[#27272A] text-[#7D40FF] flex items-center justify-center mb-6 shadow-2xl relative">
                <Music className={`w-12 h-12 text-[#FF007A] ${isPlayingAudio ? 'animate-bounce' : ''}`} />
                {isPlayingAudio && (
                  <div className="absolute -bottom-2 px-2.5 py-0.5 rounded-full bg-[#7D40FF] text-[10px] font-bold text-white shadow-md">
                    PLAYING
                  </div>
                )}
              </div>

              <h3 className="font-bold text-white text-base sm:text-lg mb-1 truncate max-w-sm" title={file.originalName}>
                {file.originalName}
              </h3>
              <p className="text-xs text-[#A1A1AA] font-mono mb-6">
                {file.mimeType} • {formatBytes(file.size)}
              </p>

              {/* Custom High-Fidelity Audio Controls */}
              <div className="w-full max-w-md space-y-4 bg-[#0A0A0C] p-4 rounded-2xl border border-[#1F1F23]">
                {/* Timeline Seek Bar */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min={0}
                    max={audioDuration || 100}
                    value={audioCurrentTime}
                    onChange={handleAudioSeek}
                    className="w-full h-2 bg-[#27272A] rounded-lg appearance-none cursor-pointer accent-[#FF007A]"
                  />
                  <div className="flex justify-between text-[11px] font-mono text-[#A1A1AA]">
                    <span>{formatTime(audioCurrentTime)}</span>
                    <span>{formatTime(audioDuration)}</span>
                  </div>
                </div>

                {/* Playback & Volume Row */}
                <div className="flex items-center justify-between gap-4 pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleAudioPlay}
                      className="w-12 h-12 rounded-2xl bg-gradient-to-r from-[#FF007A] to-[#7D40FF] text-white flex items-center justify-center shadow-lg shadow-[#FF007A]/25 hover:opacity-90 active:scale-95 transition-all"
                    >
                      {isPlayingAudio ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </button>
                    <button
                      onClick={() => {
                        if (audioRef.current) {
                          audioRef.current.currentTime = 0;
                          setAudioCurrentTime(0);
                        }
                      }}
                      className="p-2.5 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-[#A1A1AA] hover:text-white transition-colors border border-[#27272A]"
                      title="Restart"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Volume Slider */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleAudioMute}
                      className="p-2 rounded-xl text-[#A1A1AA] hover:text-white hover:bg-[#18181B] transition-colors"
                    >
                      {isAudioMuted || audioVolume === 0 ? (
                        <VolumeX className="w-4 h-4 text-rose-400" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-[#7D40FF]" />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isAudioMuted ? 0 : audioVolume}
                      onChange={handleAudioVolumeChange}
                      className="w-20 sm:w-24 h-1.5 bg-[#27272A] rounded-lg appearance-none cursor-pointer accent-[#7D40FF]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Audio Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <a
                href={downloadUrl}
                className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-[#FF007A] to-[#7D40FF] text-white shadow-md shadow-[#FF007A]/20 min-h-[44px]"
              >
                <Download className="w-4 h-4" />
                Download Original Audio
              </a>
              <button
                onClick={handleShare}
                className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-[#18181B] hover:bg-[#27272A] text-white border border-[#27272A] transition-colors min-h-[44px]"
              >
                <Share2 className="w-4 h-4 text-[#FF007A]" />
                Share
              </button>
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-[#18181B] hover:bg-[#27272A] text-white border border-[#27272A] transition-colors min-h-[44px]"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-[#7D40FF]" />}
                <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>
          </div>
        )}

        {/* 4. PDF PREVIEW */}
        {file.category === 'pdf' && (
          <div className="space-y-4">
            <div className="bg-[#050505] rounded-2xl overflow-hidden border border-[#27272A] h-[550px]">
              <iframe
                src={rawFileUrl}
                title={file.originalName}
                className="w-full h-full border-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <a
                href={downloadUrl}
                className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-[#FF007A] to-[#7D40FF] text-white shadow-md shadow-[#FF007A]/20 min-h-[44px]"
              >
                <Download className="w-4 h-4" />
                Download Original PDF
              </a>
              <button
                onClick={handleShare}
                className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-[#18181B] hover:bg-[#27272A] text-white border border-[#27272A] min-h-[44px]"
              >
                <Share2 className="w-4 h-4 text-[#FF007A]" />
                Share
              </button>
            </div>
          </div>
        )}

        {/* 5. TEXT PREVIEW */}
        {file.category === 'text' && (
          <div className="space-y-4">
            <div className="bg-[#050505] rounded-2xl p-4 border border-[#27272A]">
              {loadingText ? (
                <div className="py-12 text-center text-[#A1A1AA] text-xs font-mono">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#FF007A]" />
                  Reading file text...
                </div>
              ) : (
                <pre className="font-mono text-xs text-[#E4E4E7] overflow-x-auto whitespace-pre-wrap max-h-[500px] leading-relaxed select-text">
                  {textContent || 'Empty text file'}
                </pre>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <a
                href={downloadUrl}
                className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-[#FF007A] to-[#7D40FF] text-white shadow-md shadow-[#FF007A]/20 min-h-[44px]"
              >
                <Download className="w-4 h-4" />
                Download Original File
              </a>
              <button
                onClick={handleShare}
                className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold bg-[#18181B] hover:bg-[#27272A] text-white border border-[#27272A] min-h-[44px]"
              >
                <Share2 className="w-4 h-4 text-[#FF007A]" />
                Share
              </button>
            </div>
          </div>
        )}

        {/* 6. DOCUMENT / ARCHIVE / OTHER */}
        {(file.category === 'document' || file.category === 'archive' || file.category === 'other') && (
          <div className="bg-[#050505] p-8 sm:p-12 rounded-2xl border border-[#27272A] text-center space-y-4">
            <div className="w-20 h-20 rounded-2xl bg-[#18181B] border border-[#27272A] text-[#A1A1AA] flex items-center justify-center mx-auto mb-2 shadow-inner">
              <FileIcon className="w-10 h-10 text-[#FF007A]" />
            </div>
            <h3 className="font-bold text-white text-base sm:text-lg mb-1">{file.originalName}</h3>
            <p className="text-xs text-[#A1A1AA] font-mono">
              {file.mimeType} • {formatBytes(file.size)}
            </p>
            <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
              <a
                href={downloadUrl}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#FF007A] to-[#7D40FF] text-white shadow-lg shadow-[#FF007A]/20 hover:opacity-90 active:scale-95 transition-all min-h-[46px]"
              >
                <Download className="w-4 h-4" />
                Download Original File
              </a>
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm bg-[#18181B] hover:bg-[#27272A] text-white border border-[#27272A] transition-colors min-h-[46px]"
              >
                <Share2 className="w-4 h-4 text-[#FF007A]" />
                Share
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

