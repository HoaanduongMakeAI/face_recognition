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
                                            canvas.width = img.width;
                                            canvas.height = img.height;
                                            ctx.drawImage(img, 0, 0, img.width, img.height);

                                            let list_html = "";
                                            recognized_faces.forEach(face => {
                                                const [x1, y1, x2, y2] = face.bbox;
                                                
                                                ctx.beginPath();
                                                ctx.rect(x1, y1, x2 - x1, y2 - y1);
                                                ctx.lineWidth = 2;
                                                ctx.strokeStyle = 'red';
                                                ctx.stroke();

                                                ctx.fillStyle = 'red';
                                                ctx.font = '16px Arial';
                                                ctx.fillText(`${face.name} (${(face.similarity * 100).toFixed(2)}%)`, x1, y1 > 20 ? y1 - 5 : y1 + 20);

                                                list_html += `<p><strong>${__('Name')}:</strong> ${face.name}, <strong>${__('Similarity')}:</strong> ${(face.similarity * 100).toFixed(2)}%</p>`;
                                            });
                                            faceListDiv.innerHTML = list_html;
                                        };
                                        // If image is already loaded (e.g., from cache), trigger onload manually
                                        if (img.complete) {
                                            img.onload();
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