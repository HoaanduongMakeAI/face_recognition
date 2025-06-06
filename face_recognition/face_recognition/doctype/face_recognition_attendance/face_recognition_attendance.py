import frappe
from frappe.model.document import Document
import requests
import json
import os
from frappe.utils import get_files_path

class FaceRecognitionAttendance(Document):
    def get_server_settings(self):
        settings = frappe.get_single("Face Recognition Setting")
        if not settings.server_url or not settings.api_key:
            frappe.throw("Face Recognition Server URL and API Key must be set in Face Recognition Setting.")
        return settings.server_url, settings.get_password("api_key")

    @frappe.whitelist()
    def enroll_student_faces(self):
        collection_name = self.collection
        student_group_name = self.student_group

        if not collection_name or not student_group_name:
            frappe.throw("Please select both a Collection and a Student Group.")

        students = frappe.get_all("Student Group Student",filters={"parent": student_group_name},fields=["student"])
        
        if not students:
            frappe.throw(f"No students found in Student Group: {student_group_name}")

        server_url, api_key = self.get_server_settings()
        enroll_endpoint = f"{server_url}/enroll_face/{collection_name}"
        headers = {"X-API-Key": api_key}
        
        enrolled_count = 0
        failed_enrollments = []

        for student_data in students:
            student_doc = frappe.get_doc("Student", student_data.student)
            person_name = student_doc.student_name
            image_file_url = student_doc.image # Assuming 'image' field stores the student's photo

            if not image_file_url:
                frappe.msgprint(f"Student {person_name} ({student_doc.name}) does not have an image. Skipping enrollment.")
                failed_enrollments.append(f"{person_name} (No image)")
                continue

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
                    "person_name": (None, person_name)
                }

                response = requests.post(enroll_endpoint, headers=headers, files=files)
                response.raise_for_status()
                enrolled_count += 1
                frappe.msgprint(f"Successfully enrolled {person_name}.")

            except requests.exceptions.RequestException as e:
                frappe.msgprint(f"Error enrolling {person_name}: {e}")
                failed_enrollments.append(f"{person_name} ({e})")
            except Exception as e:
                frappe.msgprint(f"An unexpected error occurred during enrollment for {person_name}: {e}")
        
        message = f"Enrollment complete. Successfully enrolled {enrolled_count} students."
        if failed_enrollments:
            message += f"\nFailed enrollments: {', '.join(failed_enrollments)}"
        
        return {"message": message}

    @frappe.whitelist()
    def recognize_and_mark_attendance(self, image_file_url):
        collection_name = self.collection
        student_group_name = self.student_group
        
        if not collection_name or not student_group_name:
            frappe.throw("Please select both a Collection and a Student Group.")

        server_url, api_key = self.get_server_settings()
        recognize_endpoint = f"{server_url}/recognize_face/{collection_name}"
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

            response = requests.post(recognize_endpoint, headers=headers, files=files)
            response.raise_for_status()
            recognized_data = response.json()
            
            recognized_faces = recognized_data.get("recognized_faces", [])
            
            if not recognized_faces:
                return {"message": "No faces recognized.", "recognized_faces": []}

            today = frappe.utils.today()
            marked_students = []
            
            for face in recognized_faces:
                person_name = face.get("name")
                
                # Find student by name (this might need a more robust lookup, e.g., by a unique ID)
                student_name_from_db = frappe.db.get_value("Student", {"student_name": person_name}, "name")
                
                if student_name_from_db:
                    # Check if attendance already marked for today
                    existing_attendance = frappe.db.exists(
                        "Student Attendance",
                        {"student": student_name_from_db, "date": today, "student_group": student_group_name}
                    )

                    if not existing_attendance:
                        attendance_doc = frappe.new_doc("Student Attendance")
                        attendance_doc.student = student_name_from_db
                        attendance_doc.student_group = student_group_name
                        attendance_doc.date = today
                        attendance_doc.status = "Present"
                        attendance_doc.save(ignore_permissions=True)
                        attendance_doc.submit()
                        marked_students.append(person_name)
                    else:
                        frappe.msgprint(f"Attendance for {person_name} already marked as {existing_attendance.status} for today.")
                else:
                    frappe.msgprint(f"Student with name {person_name} not found in ERPNext.")

            return {"message": f"Attendance marked for: {', '.join(marked_students)}", "recognized_faces": recognized_faces}

        except requests.exceptions.RequestException as e:
            frappe.throw(f"Error connecting to face recognition server: {e}")
        except Exception as e:
            frappe.throw(f"An unexpected error occurred during face recognition and attendance marking: {e}")

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
            order_by="creation desc"
        )
        if not file_doc_name:
            frappe.log_error(f"No File found for file_url: {file_url}", "Face Recognition")
        return file_doc_name
    except Exception as e:
        frappe.log_error(f"Error fetching File for url {file_url}: {e}", "Face Recognition")
        return None

@frappe.whitelist()
def enroll_single_student_face(collection_name, student_id, image_file_url):
    """
    Enrolls a single student's face into the specified collection.
    This function is called from the client-side (JS) for individual student enrollment.
    """
    settings = frappe.get_single("Face Recognition Setting")
    if not settings.server_url or not settings.api_key:
        frappe.throw("Face Recognition Server URL and API Key must be set in Face Recognition Setting.")
    server_url, api_key = settings.server_url, settings.get_password("api_key")

    enroll_endpoint = f"{server_url}/enroll_face/{collection_name}"
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

        student_doc = frappe.get_doc("Student", student_id)
        person_name_for_server = student_doc.name # Use the actual student ID for the server
        display_student_name = student_doc.student_name # Use the display name for messages

        files = {
            "file": (file_doc.file_name, file_content, file_doc.file_type),
            "person_name": (None, person_name_for_server)
        }

        response = requests.post(enroll_endpoint, headers=headers, files=files)
        response.raise_for_status()
        
        return {"message": f"Successfully enrolled {display_student_name} into collection {collection_name}."}

    except requests.exceptions.RequestException as e:
        frappe.throw(f"Error connecting to face recognition server: {e}")
    except Exception as e:
        frappe.throw(f"An unexpected error occurred during face enrollment for {display_student_name}: {e}")
