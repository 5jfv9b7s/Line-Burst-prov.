import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

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

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const byId = (id) => document.getElementById(id);
const setOnlineStatus = (message) => {
  byId('online_status').textContent = message;
};

// All room operations wait for anonymous authentication through this promise.
window.firebaseReady = signInAnonymously(auth)
  .then(({ user }) => {
    window.firebaseServices = { app, auth, db, uid: user.uid };
    return window.firebaseServices;
  })
  .catch((error) => {
    console.error('Firebase anonymous sign-in failed.', error);
    throw error;
  });

function getSelectedSettings() {
  return {
    scoreMode: byId('home_score_mode').value,
    timeControl: byId('home_time_limit').value
  };
}

function getRoomId(value) {
  const input = value.trim();
  if (!input) return null;

  // Keep accepting the old invite URL format during the transition to room IDs.
  try {
    return new URL(input).searchParams.get('room');
  } catch {
    return /^[A-Za-z0-9_-]{1,128}$/.test(input) ? input : null;
  }
}

async function createOnlineRoom() {
  const { uid } = await window.firebaseReady;
  const room = await addDoc(collection(db, 'rooms'), {
    hostId: uid,
    guestId: null,
    status: 'waiting',
    createdAt: serverTimestamp(),
    settings: getSelectedSettings()
  });

  byId('join_room_url').value = room.id;
  window.onlineRoomId = room.id;
  setJoinControlsVisible(false);
  setOnlineStatus('接続待ち：招待URLを相手へ送信してください。');
  await startHostPeer(room.id);
}

async function joinOnlineRoom() {
  const roomId = getRoomId(byId('join_room_url').value);
  if (!roomId) throw new Error('ルームIDを入力してください。');

  const { uid } = await window.firebaseReady;
  const roomRef = doc(db, 'rooms', roomId);
  const room = await getDoc(roomRef);

  if (!room.exists() || room.data().guestId) {
    throw new Error('参加できないルームです。');
  }

  await updateDoc(roomRef, { guestId: uid, status: 'joining' });
  window.onlineRoomId = roomId;
  setOnlineStatus('参加しました。P2P接続を開始しています。');
  await startGuestPeer(roomId);
}

function publishOnlineEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function createOnlineGame(channel, isHost) {
  const onlineGame = {
    channel,
    isHost,
    assignment: null,
    send(message) {
      if (channel.readyState === 'open') {
        channel.send(JSON.stringify(message));
      }
    }
  };

  window.onlineGame = onlineGame;
  return onlineGame;
}

function createHostAssignment() {
  return {
    hostColor: Math.random() < 0.5 ? 1 : 2,
    settings: getSelectedSettings()
  };
}

function wireChannel(channel, isHost) {
  const onlineGame = createOnlineGame(channel, isHost);

  channel.onopen = () => {
    setOnlineStatus('P2P接続が完了しました。');
    if (!isHost) return;

    // The host is the sole source of the colour assignment.
    const assignment = createHostAssignment();
    onlineGame.assignment = assignment;
    onlineGame.send({ type: 'assignment', ...assignment });
    publishOnlineEvent('online:assignment', assignment);
  };

  channel.onmessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.type === 'assignment') {
      onlineGame.assignment = {
        hostColor: message.hostColor,
        settings: message.settings
      };
      publishOnlineEvent('online:assignment', onlineGame.assignment);
      return;
    }

    publishOnlineEvent('online:message', message);
  };

  channel.onclose = () => setOnlineStatus('P2P接続が切断されました。');
}

function watchHostRoom(roomRef, peer) {
  const addedGuestCandidates = new Set();

  onSnapshot(roomRef, async (snapshot) => {
    const data = snapshot.data();
    if (!data) return;

    if (data.answer && !peer.currentRemoteDescription) {
      await peer.setRemoteDescription(data.answer);
    }

    if (data.guestCandidate) {
      const key = JSON.stringify(data.guestCandidate);
      if (!addedGuestCandidates.has(key)) {
        addedGuestCandidates.add(key);
        await peer.addIceCandidate(data.guestCandidate);
      }
    }
  });
}

function watchGuestRoom(roomRef, peer) {
  const addedHostCandidates = new Set();

  onSnapshot(roomRef, async (snapshot) => {
    const data = snapshot.data();
    if (!data?.hostCandidate) return;

    const key = JSON.stringify(data.hostCandidate);
    if (addedHostCandidates.has(key)) return;

    addedHostCandidates.add(key);
    await peer.addIceCandidate(data.hostCandidate);
  });
}

async function startHostPeer(roomId) {
  const roomRef = doc(db, 'rooms', roomId);
  const peer = new RTCPeerConnection(rtcConfig);
  wireChannel(peer.createDataChannel('link-burst'), true);

  peer.onicecandidate = ({ candidate }) => {
    if (candidate) updateDoc(roomRef, { hostCandidate: candidate.toJSON() });
  };

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await updateDoc(roomRef, { offer: { type: offer.type, sdp: offer.sdp } });
  watchHostRoom(roomRef, peer);
}

async function startGuestPeer(roomId) {
  const roomRef = doc(db, 'rooms', roomId);
  const room = await getDoc(roomRef);
  const peer = new RTCPeerConnection(rtcConfig);

  peer.ondatachannel = (event) => wireChannel(event.channel, false);
  peer.onicecandidate = ({ candidate }) => {
    if (candidate) updateDoc(roomRef, { guestCandidate: candidate.toJSON() });
  };

  await peer.setRemoteDescription(room.data().offer);
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  await updateDoc(roomRef, { answer: { type: answer.type, sdp: answer.sdp } });
  watchGuestRoom(roomRef, peer);
}

document.addEventListener('DOMContentLoaded', () => {
  const mode = byId('home_mode');
  const lobby = byId('online_lobby');
  const updateLobbyVisibility = () => {
    lobby.hidden = mode.value !== 'online';
  };

  mode.addEventListener('change', updateLobbyVisibility);
  byId('create_room_button').addEventListener('click', () => {
    createOnlineRoom().catch((error) => setOnlineStatus(`作成できません：${error.message}`));
  });
  byId('join_room_button').addEventListener('click', () => {
    joinOnlineRoom().catch((error) => setOnlineStatus(`参加できません：${error.message}`));
  });

  updateLobbyVisibility();
});
