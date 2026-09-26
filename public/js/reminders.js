// Opportunity reminders: a notification when a free window from the timetable starts.
// Scheduled on the device while ATHLORA is open or installed and running.
import { api } from './api.js';
import { toast } from './ui.js';

const KEY = 'athlora_reminders';
let timers = [];

export const remindersSupported = () => 'Notification' in window;

export function remindersEnabled() {
  try { return localStorage.getItem(KEY) === 'on' && Notification.permission === 'granted'; } catch { return false; }
}

export async function enableReminders() {
  if (!remindersSupported()) throw new Error("This browser doesn't support notifications. Try Chrome, or install ATHLORA to your home screen.");
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings for this site.');
  try { localStorage.setItem(KEY, 'on'); } catch {}
  await scheduleReminders();
}

export function disableReminders() {
  try { localStorage.removeItem(KEY); } catch {}
  timers.forEach(clearTimeout);
  timers = [];
}

export async function scheduleReminders(data) {
  timers.forEach(clearTimeout);
  timers = [];
  if (!remindersEnabled()) return;
  const opps = data || await api('/opportunities').catch(() => null);
  if (!opps?.items?.length) return;
  const now = new Date();
  const nowMs = (now.getHours() * 60 + now.getMinutes()) * 60000 + now.getSeconds() * 1000;
  for (const op of opps.items) {
    if (op.status !== 'upcoming') continue;
    const wait = op.start * 60000 - nowMs;
    if (wait > 0 && wait < 16 * 3600 * 1000) timers.push(setTimeout(() => notify(op), wait));
  }
}

async function notify(op) {
  const url = `/#/move?min=${op.minutes}&env=${op.environment}`;
  const body = `${op.label}: you have ${op.minutes} free minutes. Tap for your Move Mission.`;
  toast(body);
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification('ATHLORA · time to move', {
        body, tag: `opp-${op.start}`, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url },
      });
      return;
    }
  } catch {}
  try {
    const n = new Notification('ATHLORA · time to move', { body, icon: '/icons/icon-192.png' });
    n.onclick = () => { window.focus(); location.hash = `#/move?min=${op.minutes}&env=${op.environment}`; };
  } catch {}
}
