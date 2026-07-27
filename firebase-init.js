import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, addDoc, doc, getDoc, updateDoc, serverTimestamp, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyD8T63dMy-7Tl66_0s9iFS58wCDVu3Sp8s',
  authDomain: 'link-burst.firebaseapp.com',
  projectId: 'link-burst',
  storageBucket: 'link-burst.firebasestorage.app',
  messagingSenderId: '1001062618092',
  appId: '1:1001062618092:web:28732d62592406ad3426c9',
  measurementId: 'G-JD23TCY7FD'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Future online-room code awaits this promise before accessing Firestore.
window.firebaseReady = signInAnonymously(auth)
  .then(({ user }) => {
    window.firebaseServices = { app, auth, db, uid: user.uid };
    console.info('Firebase anonymous sign-in succeeded.', user.uid);
    return window.firebaseServices;
  })
  .catch((error) => {
    console.error('Firebase anonymous sign-in failed.', error);
    throw error;
  });

const byId = (id) => document.getElementById(id);
const onlineStatus = (message) => { byId('online_status').textContent = message; };

async function createOnlineRoom() {
  const { db, uid } = await window.firebaseReady;
  const room = await addDoc(collection(db, 'rooms'), {
    hostId: uid, guestId: null, status: 'waiting', createdAt: serverTimestamp(),
    settings: { scoreMode: byId('home_score_mode').value, timeControl: byId('home_time_limit').value }
  });
  byId('join_room_url').value = room.id; window.onlineRoomId = room.id;
  onlineStatus('ルームを作成しました。接続待ちです。'); await startHostPeer(room.id);
}
async function joinOnlineRoom() {
  const roomId = getRoomId(byId('join_room_url').value);
  if (!roomId) throw new Error('招待URLを入力してください。');
  const { db, uid } = await window.firebaseReady; const roomRef = doc(db, 'rooms', roomId); const room = await getDoc(roomRef);
  if (!room.exists() || room.data().guestId) throw new Error('参加できないルームです。');
  await updateDoc(roomRef, { guestId: uid, status: 'joining' }); window.onlineRoomId = roomId;
  onlineStatus('参加しました。P2P接続を開始します。'); await startGuestPeer(roomId);
}

function getRoomId(value) {
  const input = value.trim();
  if (!input) return null;

  // Old invite URLs remain accepted, but new rooms share only the compact ID.
  try {
    return new URL(input).searchParams.get('room');
  } catch {
    return /^[A-Za-z0-9_-]{1,128}$/.test(input) ? input : null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const mode = byId('home_mode'); const lobby = byId('online_lobby');
  const update = () => { lobby.hidden = mode.value !== 'online'; }; mode.addEventListener('change', update); update();
  byId('create_room_button').addEventListener('click', () => createOnlineRoom().catch(e => onlineStatus(`作成できません：${e.message}`)));
  byId('join_room_button').addEventListener('click', () => joinOnlineRoom().catch(e => onlineStatus(`参加できません：${e.message}`)));
});
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
function publishOnlineEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function wireChannel(channel, isHost) {
  const onlineGame = window.onlineGame = {
    channel,
    isHost,
    assignment: null,
    send(message) {
      if (channel.readyState === 'open') channel.send(JSON.stringify(message));
    }
  };
  channel.onopen = () => {
    onlineStatus('P2P接続が完了しました。');
    if (!isHost) return;

    // The host alone chooses colours, so both peers agree on ownership.
    const assignment = {
      hostColor: Math.random() < 0.5 ? 1 : 2,
      settings: {
        scoreMode: byId('home_score_mode').value,
        timeControl: byId('home_time_limit').value
      }
    };
    onlineGame.assignment = assignment;
    onlineGame.send({ type: 'assignment', ...assignment });
    publishOnlineEvent('online:assignment', assignment);
  };
  channel.onmessage = (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'assignment') {
      onlineGame.assignment = { hostColor: message.hostColor, settings: message.settings };
      publishOnlineEvent('online:assignment', onlineGame.assignment);
      return;
    }
    publishOnlineEvent('online:message', message);
  };
  channel.onclose = () => onlineStatus('P2P接続が切断されました。');
}
async function startHostPeer(roomId) {
  const { db } = await window.firebaseReady; const roomRef = doc(db, 'rooms', roomId); const peer = new RTCPeerConnection(rtcConfig); wireChannel(peer.createDataChannel('link-burst'), true);
  peer.onicecandidate = ({ candidate }) => { if (candidate) updateDoc(roomRef, { hostCandidate: candidate.toJSON() }); };
  const offer = await peer.createOffer(); await peer.setLocalDescription(offer); await updateDoc(roomRef, { offer: { type: offer.type, sdp: offer.sdp } });
  onSnapshot(roomRef, async (snapshot) => { const data = snapshot.data(); if (data?.answer && !peer.currentRemoteDescription) await peer.setRemoteDescription(data.answer); if (data?.guestCandidate) await peer.addIceCandidate(data.guestCandidate); });
}
async function startGuestPeer(roomId) {
  const { db } = await window.firebaseReady; const roomRef = doc(db, 'rooms', roomId); const room = await getDoc(roomRef); const peer = new RTCPeerConnection(rtcConfig);
  peer.ondatachannel = (event) => wireChannel(event.channel, false); peer.onicecandidate = ({ candidate }) => { if (candidate) updateDoc(roomRef, { guestCandidate: candidate.toJSON() }); };
  await peer.setRemoteDescription(room.data().offer); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); await updateDoc(roomRef, { answer: { type: answer.type, sdp: answer.sdp } });
  onSnapshot(roomRef, async (snapshot) => { const data = snapshot.data(); if (data?.hostCandidate) await peer.addIceCandidate(data.hostCandidate); });
}
