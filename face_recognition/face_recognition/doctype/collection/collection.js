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
                            if (recognized_faces && recognized_faces.length > 0) {
                                let message = "Recognized Faces:<br>";
                                recognized_faces.forEach(face => {
                                    message += `Name: ${face.name}, Similarity: ${face.similarity}<br>`;
                                });
                                frappe.msgprint(message);
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