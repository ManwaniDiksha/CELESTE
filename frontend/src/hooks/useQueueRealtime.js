import { useEffect, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../services/supabase.js';

const REALTIME_TOPIC = 'celeste:live';
const REALTIME_EVENT = 'queue_changed';
const PUBLIC_REALTIME_TABLES = ['services', 'staff', 'staff_services', 'salon_settings'];

/**
 * Subscribes to the zero-PII `celeste:live` Broadcast channel and permitted
 * zero-PII public tables (`services`, `staff`, `staff_services`, `salon_settings`).
 * Triggers `onRefresh` after updates, avoids polling while connected, and
 * degrades cleanly with an explicit connection status warning when disconnected.
 */
export function useQueueRealtime(onRefresh, { enabled = true, staffIdFilter = null } = {}) {
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const staffIdFilterRef = useRef(staffIdFilter);
  staffIdFilterRef.current = staffIdFilter;

  const [status, setStatus] = useState(() => {
    if (!enabled) return 'idle';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'disconnected';
    return isSupabaseConfigured && supabase ? 'connecting' : 'unconfigured';
  });
  const [lastSyncedAt, setLastSyncedAt] = useState(() => new Date());
  const [retryCounter, setRetryCounter] = useState(0);

  const markSynced = () => {
    setLastSyncedAt(new Date());
  };

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return undefined;
    }

    let debounceTimer = null;
    let fallbackPollTimer = null;

    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        Promise.resolve(refreshRef.current?.())
          .then(() => {
            markSynced();
          })
          .catch(() => {});
      }, 220);
    };

    const startFallbackPolling = () => {
      if (fallbackPollTimer) return;
      fallbackPollTimer = setInterval(() => {
        scheduleRefresh();
      }, 15000);
    };

    const stopFallbackPolling = () => {
      if (fallbackPollTimer) {
        clearInterval(fallbackPollTimer);
        fallbackPollTimer = null;
      }
    };

    const handleOnline = () => {
      setStatus('reconnecting');
      scheduleRefresh();
      setRetryCounter((c) => c + 1);
    };

    const handleOffline = () => {
      setStatus('disconnected');
      startFallbackPolling();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!isSupabaseConfigured || !supabase) {
      setStatus('unconfigured');
      startFallbackPolling();
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        if (debounceTimer) clearTimeout(debounceTimer);
        stopFallbackPolling();
      };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('disconnected');
      startFallbackPolling();
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        if (debounceTimer) clearTimeout(debounceTimer);
        stopFallbackPolling();
      };
    }

    setStatus('connecting');

    const channelName = `${REALTIME_TOPIC}:tables:${retryCounter}`;
    let channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    // Listen to zero-PII Broadcast topic (`celeste:live` via a dedicated channel topic)
    const liveChannel = supabase
      .channel(REALTIME_TOPIC, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: REALTIME_EVENT }, (msg) => {
        const payload = msg?.payload || {};
        const activeFilter = staffIdFilterRef.current;
        if (activeFilter && payload.staff_id && payload.staff_id !== activeFilter) {
          // Staff-specific screens still refresh on staff-wide changes or matching staff_id,
          // while queue_joined/cancelled may also affect global/staff counts.
          if (payload.action === 'staff_availability_updated') {
            return;
          }
        }
        scheduleRefresh();
      });

    for (const table of PUBLIC_REALTIME_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          scheduleRefresh();
        }
      );
    }

    liveChannel.subscribe((subStatus) => {
      if (subStatus === 'SUBSCRIBED') {
        setStatus('connected');
        stopFallbackPolling();
        markSynced();
      } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT' || subStatus === 'CLOSED') {
        setStatus('disconnected');
        startFallbackPolling();
      }
    });

    channel.subscribe();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (debounceTimer) clearTimeout(debounceTimer);
      stopFallbackPolling();
      supabase.removeChannel(liveChannel).catch(() => {});
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [enabled, retryCounter]);

  const reconnect = () => {
    setStatus('reconnecting');
    setRetryCounter((c) => c + 1);
    Promise.resolve(refreshRef.current?.()).catch(() => {});
  };

  return {
    status,
    isConnected: status === 'connected',
    lastSyncedAt,
    reconnect,
    markSynced,
  };
}
