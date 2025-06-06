frappe.provide('face_recognition');

frappe.ui.form.on('Face Recognition Attendance', {
    setup: function(frm) {
        frm.attendance_area = $('<div>').appendTo(
            frm.fields_dict.attendance_html.wrapper
        );
    },

    refresh: function(frm) {
        // Add a button to enroll faces for all students in the group
        frm.add_custom_button(__('Enroll Student Faces (Group)'), function() {
            if (!frm.doc.collection || !frm.doc.student_group) {
                frappe.msgprint(__('Please select both a Collection and a Student Group first.'));
                return;
            }
            frm.call('enroll_student_faces', {}, function(r) {
                if (r.message) {
                    frappe.msgprint(r.message);
                    frm.reload_doc();
                }
            });
        }, __('Actions'));

        // Add a button to enroll a single student's face
        frm.add_custom_button(__('Enroll Single Student Face'), function() {
            let d = new frappe.ui.Dialog({
                title: __('Enroll Single Student Face'),
                fields: [
                    {
                        label: __('Student'),
                        fieldname: 'student',
                        fieldtype: 'Select', // Changed to Select
                        options: [], // Will be populated dynamically
                        reqd: 1
                    },
                    {
                        label: __('Upload Image'),
                        fieldname: 'image_file',
                        fieldtype: 'AttachImage',
                        reqd: 1
                    }
                ],
                primary_action_label: __('Enroll'),
                primary_action: function(values) {
                    if (!values.student || !values.image_file) {
                        frappe.msgprint(__('Please provide both student and an image.'));
                        return;
                    }
                    if (!frm.doc.collection) {
                        frappe.msgprint(__('Please select a Collection first.'));
                        return;
                    }
                    d.hide();
                    frappe.call({
                        method: 'face_recognition.face_recognition.doctype.face_recognition_attendance.face_recognition_attendance.enroll_single_student_face',
                        args: {
                            collection_name: frm.doc.collection,
                            student_id: values.student, // This will be the student's unique ID (name field)
                            image_file_url: values.image_file
                        },
                        callback: function(r) {
                            if (r.message) {
                                frappe.msgprint(r.message);
                                frm.reload_doc();
                            }
                        }
                    });
                }
            });

            // Populate student options when dialog is shown
            d.on_page_show = function() {
                if (frm.doc.student_group) {
                    frappe.call({
                        method: 'face_recognition.face_recognition.doctype.face_recognition_attendance.face_recognition_attendance.get_students_in_group_for_query',
                        args: {
                            filters: {
                                "student_group": frm.doc.student_group
                            }
                        },
                        callback: function(r) {
                            if (r.message) {
                                let student_options = r.message.map(s => ({ label: s[1], value: s[0] }));
                                d.set_df_property('student', 'options', student_options);
                            } else {
                                frappe.msgprint(__('No students found in the selected Student Group.'));
                            }
                        }
                    });
                } else {
                    frappe.msgprint(__('Please select a Student Group first to load students.'));
                }
            };
            d.show();
        }, __('Actions'));

        // Add a button to recognize faces and mark attendance
        frm.add_custom_button(__('Recognize Faces & Mark Attendance'), function() {
            let d = new frappe.ui.Dialog({
                title: __('Recognize Faces & Mark Attendance'),
                fields: [
                    {
                        label: __('Upload Image'),
                        fieldname: 'image_file',
                        fieldtype: 'AttachImage',
                        reqd: 1
                    }
                ],
                primary_action_label: __('Recognize & Mark'),
                primary_action: function(values) {
                    if (!values.image_file) {
                        frappe.msgprint(__('Please upload an image for recognition.'));
                        return;
                    }
                    if (!frm.doc.collection || !frm.doc.student_group) {
                        frappe.msgprint(__('Please select both a Collection and a Student Group first.'));
                        return;
                    }
                    d.hide();
                    frm.call('recognize_and_mark_attendance', {
                        image_file_url: values.image_file
                    }, function(r) {
                        if (r.message) {
                            let recognized_faces = r.message.recognized_faces;
                            let message_text = r.message.message;
                            let image_url = values.image_file;

                            let message_html = `
                                <div>
                                    <h4>${__('Recognition Result')}</h4>
                                    <p>${message_text}</p>
                                    <div style="position: relative; display: inline-block;">
                                        <img id="face_recognition_attendance_image" src="${image_url}" style="max-width: 100%; height: auto;">
                                        <canvas id="face_recognition_attendance_canvas" style="position: absolute; top: 0; left: 0;"></canvas>
                                    </div>
                                    <div id="recognized_faces_attendance_list"></div>
                                </div>
                            `;
                            
                            frappe.msgprint({
                                title: __('Face Recognition Attendance Result'),
                                message: message_html,
                                as_html: true,
                            });

                            setTimeout(() => {
                                const img = document.getElementById('face_recognition_attendance_image');
                                const canvas = document.getElementById('face_recognition_attendance_canvas');
                                const faceListDiv = document.getElementById('recognized_faces_attendance_list');

                                if (img && canvas && faceListDiv) {
                                    const ctx = canvas.getContext('2d');
                                    if (!ctx) {
                                        console.error("Failed to get 2D context for canvas.");
                                        return;
                                    }

                                    img.onload = () => {
                                        canvas.width = img.clientWidth;
                                        canvas.height = img.clientHeight;
                                        ctx.drawImage(img, 0, 0, img.clientWidth, img.clientHeight);

                                        const scaleX = img.clientWidth / img.naturalWidth;
                                        const scaleY = img.clientHeight / img.naturalHeight;

                                        let list_html = "";
                                        recognized_faces.forEach(face => {
                                            const [x1_orig, y1_orig, x2_orig, y2_orig] = face.bbox;
                                            const x1 = x1_orig * scaleX;
                                            const y1 = y1_orig * scaleY;
                                            const x2 = x2_orig * scaleX;
                                            const y2 = y2_orig * scaleY;
                                            
                                            ctx.beginPath();
                                            ctx.rect(x1, y1, x2 - x1, y2 - y1);
                                            ctx.lineWidth = 2;
                                            ctx.strokeStyle = 'green';
                                            ctx.stroke();

                                            ctx.fillStyle = 'green';
                                            ctx.font = 'bold 16px Arial';
                                            ctx.fillText(`${face.name} (${(face.similarity * 100).toFixed(2)}%)`, x1, y1 > 20 ? y1 - 5 : y1 + 20);

                                            list_html += `<p><strong>${__('Name')}:</strong> ${face.name}, <strong>${__('Similarity')}:</strong> ${(face.similarity * 100).toFixed(2)}%</p>`;
                                        });
                                        faceListDiv.innerHTML = list_html;
                                    };
                                    
                                    img.onerror = () => {
                                        frappe.msgprint(__('Failed to load image for drawing bounding boxes. Please ensure the image URL is accessible.'));
                                    };

                                    img.src = image_url;

                                    if (img.complete) {
                                        img.onload();
                                    }
                                } else {
                                    console.error("Elements not found after setTimeout for attendance recognition.");
                                }
                            }, 1000);
                        }
                    });
                }
            });
            d.show();
        }, __('Actions'));

        // Render the attendance marking interface
        frm.trigger('render_attendance_tool');
    },

    student_group: function(frm) {
        frm.trigger('render_attendance_tool');
    },

    render_attendance_tool: function(frm) {
        if (!frm.doc.collection || !frm.doc.student_group) {
            frm.attendance_area.html(`
                <div class="text-center text-muted" style="padding: 2rem 0;">
                    ${__('Please select a Collection and a Student Group to view attendance tool.')}
                </div>
            `);
            return;
        }

        frm.attendance_area.html(`
            <div class="face-recognition-attendance-tool">
                <p>
                    <button class="btn btn-default btn-sm" id="start_camera_btn">${__('Start Camera')}</button>
                    <button class="btn btn-default btn-sm" id="stop_camera_btn" style="display:none;">${__('Stop Camera')}</button>
                    <button class="btn btn-primary btn-sm" id="capture_and_mark_btn" style="display:none;">${__('Capture & Mark Attendance')}</button>
                </p>
                <div class="camera-container" style="position: relative; width: 100%; max-width: 640px; margin-top: 10px;">
                    <video id="camera_feed" autoplay style="width: 100%; height: auto; border: 1px solid #ccc;"></video>
                    <canvas id="camera_canvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></canvas>
                </div>
                <div id="attendance_status_message" style="margin-top: 10px; font-weight: bold;"></div>
            </div>
        `);

        const video = document.getElementById('camera_feed');
        const canvas = document.getElementById('camera_canvas');
        const ctx = canvas.getContext('2d');
        const startCameraBtn = document.getElementById('start_camera_btn');
        const stopCameraBtn = document.getElementById('stop_camera_btn');
        const captureAndMarkBtn = document.getElementById('capture_and_mark_btn');
        const attendanceStatusMessage = document.getElementById('attendance_status_message');

        let stream;
        let recognitionInterval;

        startCameraBtn.onclick = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
                video.srcObject = stream;
                video.play();
                startCameraBtn.style.display = 'none';
                stopCameraBtn.style.display = 'inline-block';
                captureAndMarkBtn.style.display = 'inline-block';
                attendanceStatusMessage.textContent = __('Camera started. Ready to capture.');

                // Set canvas dimensions to match video feed
                video.onloadedmetadata = () => {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                };

                // Start continuous recognition (e.g., every 5 seconds)
                recognitionInterval = setInterval(() => {
                    captureAndMarkAttendance();
                }, 5000); // Adjust interval as needed
                
            } catch (err) {
                console.error("Error accessing camera: ", err);
                frappe.msgprint(__('Error accessing camera. Please ensure camera is available and permissions are granted.'));
                attendanceStatusMessage.textContent = __('Camera access denied or error.');
            }
        };

        stopCameraBtn.onclick = () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                video.srcObject = null;
                startCameraBtn.style.display = 'inline-block';
                stopCameraBtn.style.display = 'none';
                captureAndMarkBtn.style.display = 'none';
                attendanceStatusMessage.textContent = __('Camera stopped.');
                clearInterval(recognitionInterval); // Stop continuous recognition
                ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas
            }
        };

        captureAndMarkBtn.onclick = () => {
            captureAndMarkAttendance();
        };

        function captureAndMarkAttendance() {
            if (!stream) {
                frappe.msgprint(__('Camera not started. Please start the camera first.'));
                return;
            }

            // Draw the current video frame to the canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Get image data from canvas
            const imageDataUrl = canvas.toDataURL('image/jpeg'); // You can choose 'image/png' as well

            // Convert data URL to Blob and then to File object
            fetch(imageDataUrl)
                .then(res => res.blob())
                .then(blob => {
                    const file = new File([blob], `attendance_capture_${frappe.datetime.now_datetime()}.jpeg`, { type: 'image/jpeg' });
                    
                    // Upload the file to Frappe
                    frappe.upload_file({
                        file: file,
                        method: 'upload_file', // Standard Frappe method for file upload
                        callback: function(r) {
                            if (r.message && r.message.file_url) {
                                const uploaded_file_url = r.message.file_url;
                                attendanceStatusMessage.textContent = __('Image captured and uploaded. Recognizing faces...');

                                // Call the server-side recognition and attendance marking method
                                frm.call('recognize_and_mark_attendance', {
                                    image_file_url: uploaded_file_url
                                }, function(response) {
                                    if (response.message) {
                                        let recognized_faces = response.message.recognized_faces;
                                        let message_text = response.message.message;
                                        
                                        attendanceStatusMessage.textContent = message_text;

                                        // Clear previous drawings
                                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height); // Redraw current frame

                                        if (recognized_faces && recognized_faces.length > 0) {
                                            const scaleX = canvas.width / video.videoWidth;
                                            const scaleY = canvas.height / video.videoHeight;

                                            recognized_faces.forEach(face => {
                                                const [x1_orig, y1_orig, x2_orig, y2_orig] = face.bbox;
                                                const x1 = x1_orig * scaleX;
                                                const y1 = y1_orig * scaleY;
                                                const x2 = x2_orig * scaleX;
                                                const y2 = y2_orig * scaleY;
                                                
                                                ctx.beginPath();
                                                ctx.rect(x1, y1, x2 - x1, y2 - y1);
                                                ctx.lineWidth = 2;
                                                ctx.strokeStyle = 'green';
                                                ctx.stroke();

                                                ctx.fillStyle = 'green';
                                                ctx.font = 'bold 16px Arial';
                                                ctx.fillText(`${face.name} (${(face.similarity * 100).toFixed(2)}%)`, x1, y1 > 20 ? y1 - 5 : y1 + 20);
                                            });
                                        }
                                    } else {
                                        attendanceStatusMessage.textContent = __('Recognition failed.');
                                    }
                                });
                            } else {
                                frappe.msgprint(__('File upload failed.'));
                                attendanceStatusMessage.textContent = __('Image upload failed.');
                            }
                        }
                    });
                });
        }
    }
});