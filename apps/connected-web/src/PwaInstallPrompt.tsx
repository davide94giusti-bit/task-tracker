import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AddToHomeScreen, CheckCircle, Close, IosShare } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Snackbar, Stack, Typography } from '@mui/material';
import { detectPwaPlatform, type PwaPlatform } from './pwaInstall';

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform?: string };
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<InstallChoice>;
}

function standaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

type PwaInstallContextValue = {
  installed: boolean;
  platform: PwaPlatform;
  canPrompt: boolean;
  installing: boolean;
  instructionsOpen: boolean;
  requiresInstallForPush: boolean;
  requestInstall: () => Promise<void>;
  showInstructions: () => void;
  closeInstructions: () => void;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);
export const PWA_INSTALL_RETURN_PATH_KEY = 'task-tracker:pwa-install-return-path';

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const [installed, setInstalled] = useState(standaloneMode);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const platform = useMemo(() => detectPwaPlatform(navigator.userAgent, navigator.maxTouchPoints), []);

  useEffect(() => {
    if (standaloneMode()) {
      const returnPath = localStorage.getItem(PWA_INSTALL_RETURN_PATH_KEY);
      if (returnPath?.startsWith('/') && !returnPath.startsWith('//')) {
        localStorage.removeItem(PWA_INSTALL_RETURN_PATH_KEY);
        if (`${location.pathname}${location.search}` !== returnPath) {
          location.replace(returnPath);
          return;
        }
      }
    }
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const refreshInstalled = () => setInstalled(standaloneMode());
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const installedHandler = () => {
      setInstalled(true);
      setPromptEvent(null);
      setInstructionsOpen(false);
      setMessage('Task Tracker was installed. Open the installed app, then enable notifications.');
    };
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', installedHandler);
    displayMode.addEventListener?.('change', refreshInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', installedHandler);
      displayMode.removeEventListener?.('change', refreshInstalled);
    };
  }, []);

  const requestInstall = async () => {
    if (installed) {
      setMessage('Task Tracker is already installed on this device.');
      return;
    }
    if (platform === 'ios' || !promptEvent) {
      setInstructionsOpen(true);
      return;
    }
    setInstalling(true);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setPromptEvent(null);
      if (choice.outcome === 'accepted') setMessage('Installation accepted. Open Task Tracker from your app list, then enable notifications.');
      else setMessage('Installation was dismissed. You can install later from Settings.');
    } catch (error) {
      setMessage((error as Error).message || 'The browser could not open its installation prompt.');
      setInstructionsOpen(true);
    } finally {
      setInstalling(false);
    }
  };

  const value: PwaInstallContextValue = {
    installed,
    platform,
    canPrompt: Boolean(promptEvent),
    installing,
    instructionsOpen,
    requiresInstallForPush: platform === 'ios' && !installed,
    requestInstall,
    showInstructions: () => setInstructionsOpen(true),
    closeInstructions: () => setInstructionsOpen(false),
  };

  return <PwaInstallContext.Provider value={value}>
    {children}
    <Snackbar open={Boolean(message)} autoHideDuration={6000} message={message} onClose={() => setMessage('')}/>
  </PwaInstallContext.Provider>;
}

export function usePwaInstall() {
  const context = useContext(PwaInstallContext);
  if (!context) throw new Error('usePwaInstall must be used within PwaInstallProvider');
  return context;
}

const DISMISS_KEY = 'task-tracker:pwa-install-dismissed-until';

export function PwaInstallBanner({ hidden = false }: { hidden?: boolean }) {
  const install = usePwaInstall();
  const [dismissed, setDismissed] = useState(() => Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now());
  if (hidden || install.installed || dismissed || (install.platform !== 'ios' && !install.canPrompt)) return null;
  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setDismissed(true);
  };
  return <Alert
    severity="info"
    icon={<AddToHomeScreen/>}
    action={<Stack direction="row" alignItems="center" spacing={.5} sx={{ width: { xs: '100%', sm: 'auto' } }}>
      <Button color="inherit" disabled={install.installing} onClick={() => void install.requestInstall()} sx={{ minHeight: 44, flex: { xs: 1, sm: 'initial' } }}>
        {install.platform === 'ios' ? 'Show installation steps' : 'Install Task Tracker'}
      </Button>
      <IconButton color="inherit" aria-label="Dismiss installation reminder for seven days" onClick={dismiss} sx={{ minWidth: 44, minHeight: 44 }}><Close/></IconButton>
    </Stack>}
    sx={{ mb: 2, alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, '& .MuiAlert-message': { width: '100%', minWidth: 0 }, '& .MuiAlert-action': { alignItems: 'center', pt: { xs: 1, sm: 0 }, pl: { xs: 0, sm: 2 }, ml: { xs: 0, sm: 'auto' }, width: { xs: '100%', sm: 'auto' } } }}
  >
    <Typography fontWeight={800}>{install.platform === 'ios' ? 'Install Task Tracker to enable notifications' : 'Install Task Tracker for reliable reminders'}</Typography>
    <Typography variant="body2">{install.platform === 'ios' ? 'iPhone and iPad receive web notifications through the installed Home Screen app.' : 'Install the app for quick access and reminders when Task Tracker is closed.'}</Typography>
  </Alert>;
}

export function PwaInstallCard({ notificationPermission }: { notificationPermission: NotificationPermission | 'unsupported' }) {
  const install = usePwaInstall();
  const actionLabel = install.platform === 'ios' ? 'Show installation steps' : install.canPrompt ? 'Install Task Tracker' : 'Show installation help';
  return <Card variant="outlined" sx={{ mb: 2 }}>
    <CardContent>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5}>
        <Box>
          <Typography variant="h6">Application installation</Typography>
          <Typography color="text.secondary">
            {install.installed
              ? 'Task Tracker is running as an installed application. Notification permission is managed separately.'
              : install.platform === 'ios'
                ? 'Add Task Tracker to the Home Screen before enabling notifications on iPhone or iPad.'
                : 'Installation is recommended for reliable reminders and faster access.'}
          </Typography>
        </Box>
        {!install.installed && <Button variant="contained" startIcon={<AddToHomeScreen/>} disabled={install.installing} onClick={() => void install.requestInstall()} sx={{ minHeight: 44, flexShrink: 0 }}>{actionLabel}</Button>}
      </Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mt={2}>
        <Chip icon={install.installed ? <CheckCircle/> : undefined} color={install.installed ? 'success' : 'warning'} label={install.installed ? 'Application installed' : 'Running in browser'}/>
        <Chip color={notificationPermission === 'granted' ? 'success' : notificationPermission === 'denied' ? 'error' : 'default'} label={`Notification permission: ${notificationPermission}`}/>
        {install.platform === 'ios' && <Chip variant="outlined" label="iPhone / iPad"/>}
      </Stack>
    </CardContent>
  </Card>;
}

export function PwaInstallInstructions() {
  const install = usePwaInstall();
  const ios = install.platform === 'ios';
  return <Dialog open={install.instructionsOpen} onClose={install.closeInstructions} fullWidth maxWidth="sm" aria-labelledby="pwa-install-title">
    <DialogTitle id="pwa-install-title">{ios ? 'Add Task Tracker to your Home Screen' : 'Install Task Tracker'}</DialogTitle>
    <DialogContent>
      {ios ? <Stack spacing={2}>
        <Alert severity="info">iPhone and iPad require the installed Home Screen app to receive Task Tracker web notifications.</Alert>
        <Stack direction="row" spacing={1.5} alignItems="flex-start"><IosShare color="primary"/><Box><Typography fontWeight={800}>1. Open this page in Safari and tap Share</Typography><Typography variant="body2" color="text.secondary">The Share button is a square with an upward arrow. If you are using another browser, copy the address and open it in Safari.</Typography></Box></Stack>
        <Stack direction="row" spacing={1.5} alignItems="flex-start"><AddToHomeScreen color="primary"/><Box><Typography fontWeight={800}>2. Select Add to Home Screen</Typography><Typography variant="body2" color="text.secondary">Scroll the share sheet if the option is not immediately visible, then confirm Add.</Typography></Box></Stack>
        <Stack direction="row" spacing={1.5} alignItems="flex-start"><CheckCircle color="success"/><Box><Typography fontWeight={800}>3. Open Task Tracker from the Home Screen</Typography><Typography variant="body2" color="text.secondary">Sign in, return to Settings, and select Enable notifications. Installation alone does not grant notification permission.</Typography></Box></Stack>
      </Stack> : <Stack spacing={1.5}>
        <Typography>Your browser did not expose its automatic installation dialog. Use the browser menu and select <strong>Install Task Tracker</strong>, <strong>Install app</strong>, or <strong>Add to Home Screen</strong>.</Typography>
        <Typography variant="body2" color="text.secondary">If no installation option is available, update the browser and confirm that you opened the secure production website rather than an embedded preview.</Typography>
      </Stack>}
    </DialogContent>
    <DialogActions><Button onClick={install.closeInstructions}>Close</Button></DialogActions>
  </Dialog>;
}
