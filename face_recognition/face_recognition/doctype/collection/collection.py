import frappe
from frappe.model.document import Document
import requests
import json

class Collection(Document):
    def get_server_settings(self):
        settings = frappe.get_single("Face Recognition Setting")
        if not settings.server_url or not settings.api_key:
            frappe.throw("Face Recognition Server URL and API Key must be set in Face Recognition Setting.")
        return settings.server_url, settings.get_password("api_key")

    @frappe.whitelist()
    def sync_faces_from_server(self):
        server_url, api_key = self.get_server_settings()
        collection_name = self.collection_name
        endpoint = f"{server_url}/list_faces/{collection_name}"
        headers = {"X-API-Key": api_key}

        frappe.throw(f"{api_key}")

        try:
            response = requests.get(endpoint, headers=headers)
            response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
            data = response.json()
            
            # Clear existing faces
            self.set("faces", [])
            
            # Add new faces from server
            if data and "face_ids" in data:
                for face_id in data["face_ids"]:
                    self.append("faces", {"face_id": face_id})
            
            self.save()
            frappe.db.commit()
            return {"message": f"Successfully synchronized {len(self.faces)} faces from server."}
        except requests.exceptions.RequestException as e:
            frappe.throw(f"Error connecting to face recognition server: {e}")
        except json.JSONDecodeError:
            frappe.throw("Invalid JSON response from face recognition server.")
        except Exception as e:
            frappe.throw(f"An unexpected error occurred during face synchronization: {e}")

    @frappe.whitelist()
    def enroll_face_on_server(self, person_name, image_file_id):
        server_url, api_key = self.get_server_settings()
        collection_name = self.collection_name
        endpoint = f"{server_url}/enroll_face/{collection_name}"
        headers = {"X-API-Key": api_key}

        try:
            # Get the file content from Frappe
            file_doc = frappe.get_doc("File", image_file_id)
            file_content = frappe.get_file(file_doc.file_url)

            files = {
                "file": (file_doc.file_name, file_content, file_doc.file_type),
                "person_name": (None, person_name) # FastAPI expects person_name as a form field
            }

            response = requests.post(endpoint, headers=headers, files=files)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            frappe.throw(f"Error connecting to face recognition server: {e}")
        except Exception as e:
            frappe.throw(f"An unexpected error occurred during face enrollment: {e}")

    @frappe.whitelist()
    def recognize_face_on_server(self, image_file_id):
        server_url, api_key = self.get_server_settings()
        collection_name = self.collection_name
        endpoint = f"{server_url}/recognize_face/{collection_name}"
        headers = {"X-API-Key": api_key}

        try:
            # Get the file content from Frappe
            file_doc = frappe.get_doc("File", image_file_id)
            file_content = frappe.get_file(file_doc.file_url)

            files = {"file": (file_doc.file_name, file_content, file_doc.file_type)}

            response = requests.post(endpoint, headers=headers, files=files)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            frappe.throw(f"Error connecting to face recognition server: {e}")
        except Exception as e:
            frappe.throw(f"An unexpected error occurred during face recognition: {e}")