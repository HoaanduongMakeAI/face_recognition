frappe.ui.form.on('Collection', {
    refresh: function(frm) {
        // Add a button to sync faces from the server
        frm.add_custom_button(__('Sync Faces from Server'), function() {
            frm.call('sync_faces_from_server', {}, function(r) {
                if (r.message) {
                    frappe.msgprint(r.message);
                    frm.reload_doc();
                }
            });
        }, __('Actions'));

        // Add a button to enroll a new face
        frm.add_custom_button(__('Enroll Face'), function() {
            let d = new frappe.ui.Dialog({
                title: __('Enroll New Face'),
                fields: [
                    {
                        label: __('Person Name'),
                        fieldname: 'person_name',
                        fieldtype: 'Data',
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
                    if (!values.person_name || !values.image_file) {
                        frappe.msgprint(__('Please provide both person name and an image.'));
                        return;
                    }
                    d.hide();
                    frm.call('enroll_face_on_server', {
                        person_name: values.person_name,
                        image_file_url: values.image_file
                    }, function(r) {
                        if (r.message) {
                            frappe.msgprint(r.message);
                            frm.reload_doc();
                        }
                    });
                }
            });
            d.show();
        }, __('Actions'));

        // Add a button to recognize faces
        frm.add_custom_button(__('Recognize Face'), function() {
            let d = new frappe.ui.Dialog({
                title: __('Recognize Face from Image'),
                fields: [
                    {
                        label: __('Upload Image'),
                        fieldname: 'image_file',
                        fieldtype: 'AttachImage',
                        reqd: 1
                    }
                ],
                primary_action_label: __('Recognize'),
                primary_action: function(values) {
                    if (!values.image_file) {
                        frappe.msgprint(__('Please upload an image for recognition.'));
                        return;
                    }
                    d.hide();
                    frm.call('recognize_face_on_server', {
                        image_file_url: values.image_file
                    }, function(r) {
                        if (r.message) {
                            let recognized_faces = r.message.recognized_faces;
                            let image_url = values.image_file; // Capture the image URL

                            if (recognized_faces && recognized_faces.length > 0) {
                                let message_html = `
                                    <div>
                                        <h4>${__('Recognized Faces')}</h4>
                                        <div style="position: relative; display: inline-block;">
                                            <img id="face_recognition_image" src="${image_url}" style="max-width: 100%; height: auto;">
                                            <canvas id="face_recognition_canvas" style="position: absolute; top: 0; left: 0;"></canvas>
                                        </div>
                                        <div id="recognized_faces_list"></div>
                                    </div>
                                `;
                                
                                frappe.msgprint({
                                    title: __('Face Recognition Result'),
                                    message: message_html,
                                    as_html: true,
                                    on_page_show: () => {
                                        const img = document.getElementById('face_recognition_image');
                                        const canvas = document.getElementById('face_recognition_canvas');
                                        const ctx = canvas.getContext('2d');
                                        const faceListDiv = document.getElementById('recognized_faces_list');

                                        img.onload = () => {
                                            frappe.msgprint("img.onload");
                                            // Set canvas dimensions to match the image's rendered dimensions
                                            canvas.width = img.clientWidth;
                                            canvas.height = img.clientHeight;

                                            // Draw the image onto the canvas, scaled to fit the rendered size
                                            ctx.drawImage(img, 0, 0, img.clientWidth, img.clientHeight);

                                            // Calculate scaling factors
                                            const scaleX = img.clientWidth / img.naturalWidth;
                                            const scaleY = img.clientHeight / img.naturalHeight;

                                            let list_html = "";
                                            recognized_faces.forEach(face => {
                                                // Scale bounding box coordinates
                                                const [x1_orig, y1_orig, x2_orig, y2_orig] = face.bbox;
                                                const x1 = x1_orig * scaleX;
                                                const y1 = y1_orig * scaleY;
                                                const x2 = x2_orig * scaleX;
                                                const y2 = y2_orig * scaleY;
                                                
                                                // Draw bounding box
                                                ctx.beginPath();
                                                ctx.rect(x1, y1, x2 - x1, y2 - y1);
                                                ctx.lineWidth = 2;
                                                ctx.strokeStyle = 'red';
                                                ctx.stroke();

                                                // Draw text (name and similarity)
                                                ctx.fillStyle = 'red';
                                                ctx.font = 'bold 16px Arial'; // Make font bold for better visibility
                                                ctx.fillText(`${face.name} (${(face.similarity * 100).toFixed(2)}%)`, x1, y1 > 20 ? y1 - 5 : y1 + 20);

                                                list_html += `<p><strong>${__('Name')}:</strong> ${face.name}, <strong>${__('Similarity')}:</strong> ${(face.similarity * 100).toFixed(2)}%, <strong>${__('Bounding Box')}:</strong> [${x1_orig.toFixed(2)}, ${y1_orig.toFixed(2)}, ${x2_orig.toFixed(2)}, ${y2_orig.toFixed(2)}]</p>`;
                                            });
                                            faceListDiv.innerHTML = list_html;
                                        };
                                        
                                        // If the image is already loaded (e.g., from cache), trigger onload manually
                                        if (img.complete) {
                                            img.onload();
                                        } else {
                                            // If not complete, handle potential errors during loading
                                            img.onerror = () => {
                                                frappe.msgprint(__('Failed to load image for drawing bounding boxes. Please ensure the image URL is accessible.'));
                                            };
                                        }
                                    }
                                });
                            } else {
                                frappe.msgprint(__('No faces recognized.'));
                            }
                        }
                    });
                }
            });
            d.show();
        }, __('Actions'));
    }
});