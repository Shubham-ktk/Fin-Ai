import os
import firebase_admin
from firebase_admin import credentials, firestore

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
key_path = os.path.join(BASE_DIR, "firebase-key.json")

cred = credentials.Certificate(key_path)
firebase_admin.initialize_app(cred)

db = firestore.client()


# import os
# import firebase_admin
# from firebase_admin import credentials, firestore

# # Directory where this Python file lives
# BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# # Service account JSON (downloaded from Firebase console → Settings → Service Accounts)
# KEY_PATH = os.path.join(BASE_DIR, "firebase-key.json")

# # Initialize app only if not already initialized
# if not firebase_admin._apps:
#     cred = credentials.Certificate(KEY_PATH)
#     firebase_admin.initialize_app(cred)

# # Firestore client
# db = firestore.client()

