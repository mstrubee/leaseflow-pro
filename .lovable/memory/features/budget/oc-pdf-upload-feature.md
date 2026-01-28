# Memory: features/budget/oc-pdf-upload-feature
Updated: now

Purchase Order (OC) creation and editing dialogs include PDF file upload capability. Users can upload a single PDF file during OC creation or editing, which is automatically backed up to the contract's standardized "OC" folder in Google Drive. The uploaded file link is stored in the purchase_orders table's attachment_url field. Validation enforces PDF-only files with 20MB size limit. If Drive upload fails, the OC is still created but a warning toast notifies the user that file upload failed.

## Multi-Contract File Distribution

For multi-contract OCs, uploaded files are automatically distributed to ALL assigned contracts:
- Each contract receives its own copy of the file in its Drive "OC" folder
- The `uploadFileToMultipleContracts` function handles the parallel upload
- A summary toast indicates success/failure counts across contracts
- The primary attachment URL (from the first successful upload) is stored in all PO records

## Dialog Scrolling

All OC creation and editing dialogs use ScrollArea with flex layout to handle long forms:
- `max-h-[90vh]` limits dialog height
- Header and footer are `flex-shrink-0` 
- Content area is wrapped in ScrollArea with negative margin trick (`-mx-6 px-6`)
