import frappe
from frappe.model.document import Document
import requests
import json
import os
from frappe.utils import get_files_path

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
    def enroll_face_on_server(self, person_name, image_file_url):
        server_url, api_key = self.get_server_settings()
        collection_name = self.collection_name
        endpoint = f"{server_url}/enroll_face/{collection_name}"
        headers = {"X-API-Key": api_key}

        try:
            file_doc_name = get_latest_file_doc_name_by_url(image_file_url)
            if not file_doc_name:
                frappe.throw(f"File not found for URL: {image_file_url}")

            file_doc = frappe.get_doc("File", file_doc_name)
            file_path_abs = get_files_path(file_doc.file_name, is_private=file_doc.is_private)
            
            if not os.path.exists(file_path_abs):
                frappe.throw(f"Local file not found at path: {file_path_abs}")

            with open(file_path_abs, "rb") as f:
                file_content = f.read()

            files = {
                "file": (file_doc.file_name, file_content, file_doc.file_type),
                "person_name": (None, person_name) # FastAPI expects person_name as a form field
            }

            response = requests.post(endpoint, headers=headers, files=files)
            response.raise_for_status()
            
            # After successful enrollment, sync faces from the server
            self.sync_faces_from_server()
            
            return response.json()
        except requests.exceptions.RequestException as e:
            frappe.throw(f"Error connecting to face recognition server: {e}")
        except Exception as e:
            frappe.throw(f"An unexpected error occurred during face enrollment: {e}")

    @frappe.whitelist()
    def recognize_face_on_server(self, image_file_url):
        server_url, api_key = self.get_server_settings()
        collection_name = self.collection_name
        endpoint = f"{server_url}/recognize_face/{collection_name}"
        headers = {"X-API-Key": api_key}

        try:
            file_doc_name = get_latest_file_doc_name_by_url(image_file_url)
            if not file_doc_name:
                frappe.throw(f"File not found for URL: {image_file_url}")

            file_doc = frappe.get_doc("File", file_doc_name)
            file_path_abs = get_files_path(file_doc.file_name, is_private=file_doc.is_private)

            if not os.path.exists(file_path_abs):
                frappe.throw(f"Local file not found at path: {file_path_abs}")

            with open(file_path_abs, "rb") as f:
                file_content = f.read()

            files = {"file": (file_doc.file_name, file_content, file_doc.file_type)}

            response = requests.post(endpoint, headers=headers, files=files)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            frappe.throw(f"Error connecting to face recognition server: {e}")
        except Exception as e:
            frappe.throw(f"An unexpected error occurred during face recognition: {e}")

@frappe.whitelist()
def get_latest_file_doc_name_by_url(file_url):
    """
    Finds the most recently created File document matching the given file_url.

    :param file_url: The file_url from the Attach field.
    :return: The name (hash) of the File document or None.
    """
    if not file_url:
        frappe.log_error("get_latest_file_doc_name_by_url called with empty file_url", "Face Recognition")
        return None

    try:
        file_doc_name = frappe.db.get_value(
            "File",
            filters={"file_url": file_url},
            fieldname="name",
            order_by="creation desc",
        )
        if not file_doc_name:
            frappe.log_error(f"No File found for file_url: {file_url}", "Face Recognition")
        return file_doc_name
    except Exception as e:
        frappe.log_error(f"Error fetching File for url {file_url}: {e}", "Face Recognition")
        return None