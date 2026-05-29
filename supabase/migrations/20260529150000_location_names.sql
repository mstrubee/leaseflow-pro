-- Update names for unnamed Agroplanet/Autoplanet locations
-- Names extracted from Plantilla Locales GP.xlsx via reverse geocoding
UPDATE maintenance_locations SET name='Agroplanet Vergara'          WHERE poi_id='10bf3eae-39ff-4612-89aa-5c161f146af8';
UPDATE maintenance_locations SET name='Agroplanet Linares Bodega'   WHERE poi_id='185a4689-7557-4c31-b1f9-15125816892e';
UPDATE maintenance_locations SET name='Agroplanet Temuco'           WHERE poi_id='1cb47612-f701-4e51-9aca-b03559f703ee';
UPDATE maintenance_locations SET name='Agroplanet Ovalle'           WHERE poi_id='2d8be56d-dd2b-43ce-ba0b-9a8a94f75f30';
UPDATE maintenance_locations SET name='Agroplanet Los Ángeles'      WHERE poi_id='2e1e3540-03fc-4592-81aa-90d36aaf26e8';
UPDATE maintenance_locations SET name='Agroplanet Victoria'         WHERE poi_id='5f3c7b8b-57be-4c72-8de5-cc097990bd86';
UPDATE maintenance_locations SET name='Agroplanet Quillota'         WHERE poi_id='60d23f3f-31b2-4f41-9873-f7a7ee52508e';
UPDATE maintenance_locations SET name='Agroplanet Parral'           WHERE poi_id='73c5a1d3-6533-4beb-947d-d28eb6ba70bb';
UPDATE maintenance_locations SET name='Agroplanet Los Andes'        WHERE poi_id='84a01d98-3f53-4264-845a-d0bae15c2daa';
UPDATE maintenance_locations SET name='Agroplanet San Felipe'       WHERE poi_id='901d8bac-4e7c-42db-afa8-fc885db0aa77';
UPDATE maintenance_locations SET name='Agroplanet Concepción'       WHERE poi_id='9a0e261c-bf8e-486a-bc03-23431cc1b64c';
UPDATE maintenance_locations SET name='Agroplanet Casablanca'       WHERE poi_id='9f4332e1-999e-4356-98e1-3ec95ce7dc2f';
UPDATE maintenance_locations SET name='Agroplanet Rancagua'         WHERE poi_id='ae930d84-a311-4aa3-8b81-3a62967da5dd';
UPDATE maintenance_locations SET name='Agroplanet Melipilla'        WHERE poi_id='afe5471f-2d6e-4e7a-afe8-a9b63567afdc';
UPDATE maintenance_locations SET name='Agroplanet Santa Cruz'       WHERE poi_id='b203d82f-a2c4-4359-acaa-483913d249ed';
UPDATE maintenance_locations SET name='Agroplanet Osorno'           WHERE poi_id='ba9c4a6a-7854-4046-bbd5-4bac81005a9c';
UPDATE maintenance_locations SET name='Agroplanet San Fernando'     WHERE poi_id='c558ca21-8697-43d9-a13b-7272643a92f6';
UPDATE maintenance_locations SET name='Agroplanet Coquimbo'         WHERE poi_id='c8178660-b816-4a74-8cc8-920177b22b53';
UPDATE maintenance_locations SET name='Agroplanet Puerto Varas'     WHERE poi_id='d44f9dba-496d-4d38-8211-072a00781a0b';
UPDATE maintenance_locations SET name='Agroplanet Curicó'           WHERE poi_id='dc5bff62-5296-4384-8361-f30dc6db5318';
UPDATE maintenance_locations SET name='Agroplanet Talca'            WHERE poi_id='dff44444-0de5-42b3-b242-49a1e781d7c4';
UPDATE maintenance_locations SET name='Agroplanet Chillán'          WHERE poi_id='fc5cb59e-093f-4bad-a55e-8aec975ed47d';

-- Autoplanet unnamed (no match in Excel — named by city)
UPDATE maintenance_locations SET name='Autoplanet Parral'           WHERE poi_id='0eb7a7cd-8c9a-4a21-a92a-837f1c65f643';
UPDATE maintenance_locations SET name='Autoplanet Casablanca'       WHERE poi_id='bd16b65d-f365-4495-99ec-eb82034d8092';
UPDATE maintenance_locations SET name='Autoplanet Chillán'          WHERE poi_id='d2e245a6-166a-45e4-866e-9d2bbfb726ac';
UPDATE maintenance_locations SET name='Autoplanet Santa Cruz'       WHERE poi_id='f545b680-6020-449c-b784-cd6d26e6d8ba';
