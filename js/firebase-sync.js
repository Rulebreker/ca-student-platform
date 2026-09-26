/**
 * firebase-sync.js - TEMPORARY: Firebase Storage upload for explanation diagram images only.
 *
 * The Firebase Realtime Database is no longer used by the browser: all application data is read
 * and written through the server API (MongoDB Atlas), and js/server-sync.js refreshes shared data.
 * This file remains only until explanation-image uploads move to a separate object store, after
 * which it (and the Firebase SDK/config) is deleted.
 */

class FirebaseStorageUploader {
  _ensureApp() {
    if (typeof firebase === 'undefined' || !window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey) return false;
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(window.FIREBASE_CONFIG);
    }
    return true;
  }

  /**
   * Upload a file to Firebase Storage and return the public download URL.
   * @param {File} file - The file to upload
   * @param {string} storagePath - e.g. 'explanation-images/q-123/1234567890_diagram.png'
   * @returns {Promise<string|null>} Download URL or null on failure
   */
  async uploadToFirebaseStorage(file, storagePath) {
    if (!this._ensureApp()) {
      console.warn('[FirebaseStorage] Firebase not configured - cannot upload to Storage.');
      return null;
    }
    if (typeof firebase.storage !== 'function') {
      console.warn('[FirebaseStorage] firebase-storage-compat.js not loaded - cannot upload to Storage.');
      return null;
    }
    try {
      const storageRef = firebase.storage().ref(storagePath);
      const snapshot = await storageRef.put(file, { contentType: file.type });
      const downloadUrl = await snapshot.ref.getDownloadURL();
      console.info('[FirebaseStorage] Uploaded explanation image:', storagePath);
      return downloadUrl;
    } catch (err) {
      console.error('[FirebaseStorage] Upload error:', err);
      return null;
    }
  }
}

window.firebaseSync = new FirebaseStorageUploader();
