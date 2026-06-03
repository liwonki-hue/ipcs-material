-- MOV Valve receiving UPDATE (tag 있는 항목만)
-- mat_code + full_description(ITEM/TYPE/SIZE) 할당
SET search_path TO material, public;

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C300-BW',
      full_description = 'Start-up Auxiliary Boiler Supply MOV, MOV (GATE), DN 150, A216-WCB, 300#, BW'
  WHERE tag = 'B0-MOV-28021';

UPDATE material.receiving
  SET mat_code = 'MOV-SS04-D080-C150-BW',
      full_description = 'Demi plant to Demi tank A inlet MOV, MOV (GATE), DN 200, A351-CF8, 150#, BW'
  WHERE tag = 'B0-MOV-35001';

UPDATE material.receiving
  SET mat_code = 'MOV-SS04-D080-C150-BW',
      full_description = 'Demi plant to Demi tank B inlet MOV, MOV (GATE), DN 200, A351-CF8, 150#, BW'
  WHERE tag = 'B0-MOV-35002';

UPDATE material.receiving
  SET mat_code = 'MOV-SS04-D030-C150-RF',
      full_description = 'External Service Water Supply to Service Water Tank Inlet MOV, MOV (Butterfly Valve), DN 80, A351 CF8, 150LB, RF'
  WHERE tag = 'B0-MOV-36001';

UPDATE material.receiving
  SET mat_code = 'MOV-SS04-D030-C150-RF',
      full_description = 'External Service Water Supply to Service Water Tank Inlet MOV, MOV (Butterfly Valve), DN 80, A351 CF8, 150LB, RF'
  WHERE tag = 'B0-MOV-36002';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D040-C150-RF',
      full_description = 'Service Water Discharge to Service Water Distribution Line Common MOV, MOV (Butterfly Valve), DN 100, A216 WCB, 150LB, RF'
  WHERE tag = 'B0-MOV-36003';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D040-C150-RF',
      full_description = 'Service Water Discharge to Service Water Distribution Line Common MOV, MOV (Butterfly Valve), DN 100, A216 WCB, 150LB, RF'
  WHERE tag = 'B0-MOV-36004';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D040-C150-RF',
      full_description = 'Service Water Discharge to Service Water Distribution Line Common MOV, MOV (Butterfly Valve), DN 100, A216 WCB, 150LB, RF'
  WHERE tag = 'B0-MOV-36005';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D040-C150-RF',
      full_description = 'Service Water Discharge to Service Water Distribution Line Common MOV, MOV (Butterfly Valve), DN 100, A216 WCB, 150LB, RF'
  WHERE tag = 'B0-MOV-36006';

UPDATE material.receiving
  SET mat_code = 'MOV-SS04-D060-C150-RF',
      full_description = 'Potable Water Discharge to Potable Water Distribution Line Common MOV, MOV (Butterfly Valve), DN 150, A351 CF8, 150LB, RF'
  WHERE tag = 'B0-MOV-37003';

UPDATE material.receiving
  SET mat_code = 'MOV-SS04-D060-C150-RF',
      full_description = 'Potable Water Discharge to Potable Water Distribution Line Common MOV, MOV (Butterfly Valve), DN 150, A351 CF8, 150LB, RF'
  WHERE tag = 'B0-MOV-37004';

UPDATE material.receiving
  SET mat_code = 'MOV-SS04-D060-C150-RF',
      full_description = 'Potable Water Discharge to Potable Water Distribution Line Common MOV, MOV (Butterfly Valve), DN 150, A351 CF8, 150LB, RF'
  WHERE tag = 'B0-MOV-37005';

UPDATE material.receiving
  SET mat_code = 'MOV-SS04-D060-C150-RF',
      full_description = 'Potable Water Discharge to Potable Water Distribution Line Common MOV, MOV (Butterfly Valve), DN 150, A351 CF8, 150LB, RF'
  WHERE tag = 'B0-MOV-37006';

UPDATE material.receiving
  SET mat_code = 'MOV-SS04-D100-C150-RF',
      full_description = 'External raw water supply to raw water tank inlet MOV, MOV (Butterfly Valve), DN 250, A351 CF8, 150LB, RF'
  WHERE tag = 'B0-MOV-38001';

UPDATE material.receiving
  SET mat_code = 'MOV-SS04-D100-C150-RF',
      full_description = 'External raw water supply to raw water tank inlet MOV, MOV (Butterfly Valve), DN 250, A351 CF8, 150LB, RF'
  WHERE tag = 'B0-MOV-38002';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-RF',
      full_description = 'Raw Water Discharge to Raw Water Distribution Line Common MOV, MOV (Butterfly Valve), DN 150, A216 WCB, 150LB, RF'
  WHERE tag = 'B0-MOV-38003';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-RF',
      full_description = 'Raw Water Discharge to Raw Water Distribution Line Common MOV, MOV (Butterfly Valve), DN 150, A216 WCB, 150LB, RF'
  WHERE tag = 'B0-MOV-38004';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-RF',
      full_description = 'Raw Water Discharge to Raw Water Distribution Line Common MOV, MOV (Butterfly Valve), DN 150, A216 WCB, 150LB, RF'
  WHERE tag = 'B0-MOV-38005';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-RF',
      full_description = 'Raw Water Discharge to Raw Water Distribution Line Common MOV, MOV (Butterfly Valve), DN 150, A216 WCB, 150LB, RF'
  WHERE tag = 'B0-MOV-38006';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D160-C150-BW',
      full_description = 'Fuel Oil Transfer Pump-A Discharge MOV, MOV (GATE), DN 400, A216-WCB, 150#, BW'
  WHERE tag = 'B0-MOV-46001';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D160-C150-BW',
      full_description = 'Fuel Oil Transfer Pump-B Discharge MOV, MOV (GATE), DN 400, A216-WCB, 150#, BW'
  WHERE tag = 'B0-MOV-46002';

UPDATE material.receiving
  SET mat_code = 'MOV-AS91-D010-C1500-SW',
      full_description = 'HRSG #1 HP Steam Drain MOV (upstream NRV), MOV (GLOBE), DN 25, SA182-F91, 1500#, SW'
  WHERE tag = 'B1-MOV-26001';

UPDATE material.receiving
  SET mat_code = 'MOV-AS91-D010-C1500-SW',
      full_description = 'HRSG #2 HP Steam Drain MOV (upstream NRV), MOV (GLOBE), DN 25, SA182-F91, 1500#, SW'
  WHERE tag = 'B1-MOV-26002';

UPDATE material.receiving
  SET mat_code = 'MOV-AS91-D010-C1500-SW',
      full_description = 'HRSG #1 HP Steam Drain MOV (downstream NRV), MOV (GLOBE), DN 25, A182-F91, 1500#, SW'
  WHERE tag = 'B1-MOV-26003';

UPDATE material.receiving
  SET mat_code = 'MOV-AS91-D010-C1500-SW',
      full_description = 'HRSG #2 HP Steam Drain MOV (downstream NRV), MOV (GLOBE), DN 25, A182-F91, 1500#, SW'
  WHERE tag = 'B1-MOV-26004';

UPDATE material.receiving
  SET mat_code = 'MOV-AS91-D040-C1500-BW',
      full_description = 'Auxiliary Steam Supply MOV, MOV (GATE), DN 100, A182-F91 or A217-C12A, 1500#, BW'
  WHERE tag = 'B1-MOV-26011';

UPDATE material.receiving
  SET mat_code = 'MOV-AS91-D020-C1500-SW',
      full_description = 'HP Steam Dynamic Strainer Drain MOV, MOV (GLOBE), DN 50, A182-F91, 1500#, SW'
  WHERE tag = 'B1-MOV-26012';

UPDATE material.receiving
  SET mat_code = 'MOV-AS91-D030-C1500-BW',
      full_description = 'HP Steam Start-up Warming Drain MOV, MOV (GLOBE), DN 80, A182-F91 or A217-C12A, 1500#, BW'
  WHERE tag = 'B1-MOV-26021';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'HRSG #1 LP Steam Drain MOV (upstream NRV), MOV (GLOBE), DN 25, SA105, 600#, SW'
  WHERE tag = 'B1-MOV-27001';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'HRSG #2 LP Steam Drain MOV (upstream NRV), MOV (GLOBE), DN 25, SA105, 600#, SW'
  WHERE tag = 'B1-MOV-27002';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'HRSG #1 LP Steam Drain MOV (downstream NRV), MOV (GLOBE), DN 25, SA105, 600#, SW'
  WHERE tag = 'B1-MOV-27003';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'HRSG #2 LP Steam Drain MOV (downstream NRV), MOV (GLOBE), DN 25, SA105, 600#, SW'
  WHERE tag = 'B1-MOV-27004';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'LP Steam Common Drain MOV, MOV (GLOBE), DN 25, A105, 600#, SW'
  WHERE tag = 'B1-MOV-27011';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'Aux. PRDS Pressure Control Valve Drain MOV, MOV (GLOBE), DN 25, A105, 600#, SW'
  WHERE tag = 'B1-MOV-28001';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C300-BW',
      full_description = 'Neighboring Block Auxiliary Steam Header Supply MOV, MOV (GATE), DN 150, A216-WCB, 300#, BW'
  WHERE tag = 'B1-MOV-28011';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D020-C600-SW',
      full_description = 'Turbine Gland Seal Steam Header Supply MOV, MOV (GLOBE), DN 50, A105, 600#, SW'
  WHERE tag = 'B1-MOV-28012';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D020-C600-SW',
      full_description = 'Turbine Gland Seal Steam Header Warming Drain MOV, MOV (GLOBE), DN 50, A105, 600#, SW'
  WHERE tag = 'B1-MOV-28013';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D080-C300-BW',
      full_description = 'CEP DISCHARGE MOV, MOV (GATE), DN 200, A216-WCB, 300#, BW'
  WHERE tag = 'B1-MOV-29001';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D080-C300-BW',
      full_description = 'CEP DISCHARGE MOV, MOV (GATE), DN 200, A216-WCB, 300#, BW'
  WHERE tag = 'B1-MOV-29002';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D080-C300-BW',
      full_description = 'CEP DISCHARGE MOV, MOV (GATE), DN 200, A216-WCB, 300#, BW'
  WHERE tag = 'B1-MOV-29003';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D030-C600-BW',
      full_description = 'HRSG #11 BFP A IP Discharge MOV, MOV (GATE), DN 80, A216-WCB, 600#, BW'
  WHERE tag = 'B1-MOV-30001A';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D030-C600-BW',
      full_description = 'HRSG #11 BFP B IP Discharge MOV, MOV (GATE), DN 80, A216-WCB, 600#, BW'
  WHERE tag = 'B1-MOV-30001B';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C1500-BW',
      full_description = 'HRSG #11 BFP A HP Discharge MOV, MOV (GATE), DN 150, A216-WCC, 1500#, BW'
  WHERE tag = 'B1-MOV-30002A';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C1500-BW',
      full_description = 'HRSG #11 BFP B HP Discharge MOV, MOV (GATE), DN 150, A216-WCC, 1500#, BW'
  WHERE tag = 'B1-MOV-30002B';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C1500-SW',
      full_description = 'BYPASS MOV FOR HRSG #11 BFP A HP Discharge MOV, MOV (GLOBE), DN 25, A105, 1500#, SW'
  WHERE tag = 'B1-MOV-30003A';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C1500-SW',
      full_description = 'BYPASS MOV FOR HRSG #11 BFP B HP Discharge MOV, MOV (GLOBE), DN 25, A105, 1500#, SW'
  WHERE tag = 'B1-MOV-30003B';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D030-C600-BW',
      full_description = 'HRSG #11 BFP A IP Discharge MOV, MOV (GATE), DN 80, A216-WCB, 600#, BW'
  WHERE tag = 'B1-MOV-31001A';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D030-C600-BW',
      full_description = 'HRSG #11 BFP B IP Discharge MOV, MOV (GATE), DN 80, A216-WCB, 600#, BW'
  WHERE tag = 'B1-MOV-31001B';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C1500-BW',
      full_description = 'HRSG #11 BFP A HP Discharge MOV, MOV (GATE), DN 150, A216-WCC, 1500#, BW'
  WHERE tag = 'B1-MOV-31002A';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C1500-BW',
      full_description = 'HRSG #11 BFP B HP Discharge MOV, MOV (GATE), DN 150, A216-WCC, 1500#, BW'
  WHERE tag = 'B1-MOV-31002B';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C1500-SW',
      full_description = 'BYPASS MOV FOR HRSG #11 BFP A HP Discharge MOV, MOV (GLOBE), DN 25, A105, 1500#, SW'
  WHERE tag = 'B1-MOV-31003A';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C1500-SW',
      full_description = 'BYPASS MOV FOR HRSG #11 BFP B HP Discharge MOV, MOV (GLOBE), DN 25, A105, 1500#, SW'
  WHERE tag = 'B1-MOV-31003B';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D140-C150-RF',
      full_description = 'Each CCWP Outlet Line MOV, MOV (Butterfly Valve), DN 350, A216 WCB, 150LB, RF'
  WHERE tag = 'B1-MOV-32001';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D140-C150-RF',
      full_description = 'Each CCWP Outlet Line MOV, MOV (Butterfly Valve), DN 350, A216 WCB, 150LB, RF'
  WHERE tag = 'B1-MOV-32002';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D140-C150-RF',
      full_description = 'Each CCWP Outlet Line MOV, MOV (Butterfly Valve), DN 350, A216 WCB, 150LB, RF'
  WHERE tag = 'B1-MOV-32003';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D200-C150-RF',
      full_description = 'Each CCW FFC Bypass Line MOV, MOV (Butterfly Valve), DN 500, A216 WCB, 150LB, RF'
  WHERE tag = 'B1-MOV-32004';

UPDATE material.receiving
  SET mat_code = 'MOV-SS04-D010-C600-SW',
      full_description = 'Closed Cooling Water Head Tank Make-up Line, MOV (GLOBE), DN 25, A182-F304, 600#, SW'
  WHERE tag = 'B1-MOV-32005';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D020-C600-SW',
      full_description = 'Drain Quenching water MOV, MOV (GLOBE), DN 50, A105, 600#, SW'
  WHERE tag = 'B1-MOV-33001';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-BW',
      full_description = 'HOT WATER SUPPLY PUMP DISCHARGE MOV, MOV (GLOBE), DN 150, A216-WCB, 150#, BW'
  WHERE tag = 'B1-MOV-34001';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-BW',
      full_description = 'HOT WATER SUPPLY PUMP DISCHARGE MOV, MOV (GLOBE), DN 150, A216-WCB, 150#, BW'
  WHERE tag = 'B1-MOV-34002';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-BW',
      full_description = 'HOT WATER SUPPLY PUMP DISCHARGE MOV, MOV (GLOBE), DN 150, A216-WCB, 150#, BW'
  WHERE tag = 'B1-MOV-34003';

UPDATE material.receiving
  SET mat_code = 'MOV-SS04-D010-C600-SW',
      full_description = 'HOT WATER HEAD TANK MAKE UP LINE MOV, MOV (GLOBE), DN 25, A182-F304, 600#, SW'
  WHERE tag = 'B1-MOV-34004';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-BW',
      full_description = 'HOT WATER HEATER TUBE SIDE INLET MOV, MOV (GATE), DN 150, A216-WCB, 150#, BW'
  WHERE tag = 'B1-MOV-34005';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D100-C300-BW',
      full_description = 'HOT WATER HEATER SHELL SIDE INLET MOV, MOV (GATE), DN 250, A216-WCB, 300#, BW'
  WHERE tag = 'B1-MOV-34006';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'HOT WATER HEATER SHELL SIDE VENT LINE BYPASS MOV, MOV (GLOBE), DN 25, A105, 600#, SW'
  WHERE tag = 'B1-MOV-34007';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-BW',
      full_description = 'HOT WATER HEATER TUBE SIDE INLET MOV, MOV (GATE), DN 150, A216-WCB, 150#, BW'
  WHERE tag = 'B1-MOV-34008';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D100-C300-BW',
      full_description = 'HOT WATER HEATER SHELL SIDE INLET MOV, MOV (GATE), DN 250, A216-WCB, 300#, BW'
  WHERE tag = 'B1-MOV-34009';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'HOT WATER HEATER SHELL SIDE VENT LINE BYPASS MOV, MOV (GLOBE), DN 25, A105, 600#, SW'
  WHERE tag = 'B1-MOV-34010';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-BW',
      full_description = 'HOT WATER HEATER TUBE SIDE OUTLET MOV, MOV (GATE), DN 150, A216-WCB, 150#, BW'
  WHERE tag = 'B1-MOV-34011';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-BW',
      full_description = 'HOT WATER HEATER TUBE SIDE OUTLET MOV, MOV (GATE), DN 150, A216-WCB, 150#, BW'
  WHERE tag = 'B1-MOV-34013';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-RF',
      full_description = 'Each GT Air Preheater Supply MOV, MOV (Butterfly Valve), DN 150, A216 WCB, 150LB, RF'
  WHERE tag = 'B1-MOV-34015';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-RF',
      full_description = 'Each GT Air Preheater Supply MOV, MOV (Butterfly Valve), DN 150, A216 WCB, 150LB, RF'
  WHERE tag = 'B1-MOV-34017';

UPDATE material.receiving
  SET mat_code = 'MOV-AS91-D010-C1500-SW',
      full_description = 'HRSG #1 HP Steam Drain MOV (upstream NRV), MOV (GLOBE), DN 25, SA182-F91, 1500#, SW'
  WHERE tag = 'B2-MOV-26001';

UPDATE material.receiving
  SET mat_code = 'MOV-AS91-D010-C1500-SW',
      full_description = 'HRSG #2 HP Steam Drain MOV (upstream NRV), MOV (GLOBE), DN 25, SA182-F91, 1500#, SW'
  WHERE tag = 'B2-MOV-26002';

UPDATE material.receiving
  SET mat_code = 'MOV-AS91-D010-C1500-SW',
      full_description = 'HRSG #1 HP Steam Drain MOV (downstream NRV), MOV (GLOBE), DN 25, A182-F91, 1500#, SW'
  WHERE tag = 'B2-MOV-26003';

UPDATE material.receiving
  SET mat_code = 'MOV-AS91-D010-C1500-SW',
      full_description = 'HRSG #2 HP Steam Drain MOV (downstream NRV), MOV (GLOBE), DN 25, A182-F91, 1500#, SW'
  WHERE tag = 'B2-MOV-26004';

UPDATE material.receiving
  SET mat_code = 'MOV-AS91-D040-C1500-BW',
      full_description = 'Auxiliary Steam Supply MOV, MOV (GATE), DN 100, A182-F91 or A217-C12A, 1500#, BW'
  WHERE tag = 'B2-MOV-26011';

UPDATE material.receiving
  SET mat_code = 'MOV-AS91-D020-C1500-SW',
      full_description = 'HP Steam Dynamic Strainer Drain MOV, MOV (GLOBE), DN 50, A182-F91, 1500#, SW'
  WHERE tag = 'B2-MOV-26012';

UPDATE material.receiving
  SET mat_code = 'MOV-AS91-D030-C1500-BW',
      full_description = 'HP Steam Start-up Warming Drain MOV, MOV (GLOBE), DN 80, A182-F91 or A217-C12A, 1500#, BW'
  WHERE tag = 'B2-MOV-26021';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'HRSG #1 LP Steam Drain MOV (upstream NRV), MOV (GLOBE), DN 25, SA105, 600#, SW'
  WHERE tag = 'B2-MOV-27001';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'HRSG #2 LP Steam Drain MOV (upstream NRV), MOV (GLOBE), DN 25, SA105, 600#, SW'
  WHERE tag = 'B2-MOV-27002';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'HRSG #1 LP Steam Drain MOV (downstream NRV), MOV (GLOBE), DN 25, SA105, 600#, SW'
  WHERE tag = 'B2-MOV-27003';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'HRSG #2 LP Steam Drain MOV (downstream NRV), MOV (GLOBE), DN 25, SA105, 600#, SW'
  WHERE tag = 'B2-MOV-27004';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'LP Steam Common Drain MOV, MOV (GLOBE), DN 25, A105, 600#, SW'
  WHERE tag = 'B2-MOV-27011';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'Aux. PRDS Pressure Control Valve Drain MOV, MOV (GLOBE), DN 25, A105, 600#, SW'
  WHERE tag = 'B2-MOV-28001';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C300-BW',
      full_description = 'Neighboring Block Auxiliary Steam Header Supply MOV, MOV (GATE), DN 150, A216-WCB, 300#, BW'
  WHERE tag = 'B2-MOV-28011';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D020-C600-SW',
      full_description = 'Turbine Gland Seal Steam Header Supply MOV, MOV (GLOBE), DN 50, A105, 600#, SW'
  WHERE tag = 'B2-MOV-28012';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D020-C600-SW',
      full_description = 'Turbine Gland Seal Steam Header Warming Drain MOV, MOV (GLOBE), DN 50, A105, 600#, SW'
  WHERE tag = 'B2-MOV-28013';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D080-C300-BW',
      full_description = 'CEP DISCHARGE MOV, MOV (GATE), DN 200, A216-WCB, 300#, BW'
  WHERE tag = 'B2-MOV-29001';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D080-C300-BW',
      full_description = 'CEP DISCHARGE MOV, MOV (GATE), DN 200, A216-WCB, 300#, BW'
  WHERE tag = 'B2-MOV-29002';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D080-C300-BW',
      full_description = 'CEP DISCHARGE MOV, MOV (GATE), DN 200, A216-WCB, 300#, BW'
  WHERE tag = 'B2-MOV-29003';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D030-C600-BW',
      full_description = 'HRSG #11 BFP A IP Discharge MOV, MOV (GATE), DN 80, A216-WCB, 600#, BW'
  WHERE tag = 'B2-MOV-30001A';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D030-C600-BW',
      full_description = 'HRSG #11 BFP B IP Discharge MOV, MOV (GATE), DN 80, A216-WCB, 600#, BW'
  WHERE tag = 'B2-MOV-30001B';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C1500-BW',
      full_description = 'HRSG #11 BFP A HP Discharge MOV, MOV (GATE), DN 150, A216-WCC, 1500#, BW'
  WHERE tag = 'B2-MOV-30002A';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C1500-BW',
      full_description = 'HRSG #11 BFP B HP Discharge MOV, MOV (GATE), DN 150, A216-WCC, 1500#, BW'
  WHERE tag = 'B2-MOV-30002B';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C1500-SW',
      full_description = 'BYPASS MOV FOR HRSG #11 BFP A HP Discharge MOV, MOV (GLOBE), DN 25, A105, 1500#, SW'
  WHERE tag = 'B2-MOV-30003A';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C1500-SW',
      full_description = 'BYPASS MOV FOR HRSG #11 BFP B HP Discharge MOV, MOV (GLOBE), DN 25, A105, 1500#, SW'
  WHERE tag = 'B2-MOV-30003B';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D030-C600-BW',
      full_description = 'HRSG #11 BFP A IP Discharge MOV, MOV (GATE), DN 80, A216-WCB, 600#, BW'
  WHERE tag = 'B2-MOV-31001A';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D030-C600-BW',
      full_description = 'HRSG #11 BFP B IP Discharge MOV, MOV (GATE), DN 80, A216-WCB, 600#, BW'
  WHERE tag = 'B2-MOV-31001B';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C1500-BW',
      full_description = 'HRSG #11 BFP A HP Discharge MOV, MOV (GATE), DN 150, A216-WCC, 1500#, BW'
  WHERE tag = 'B2-MOV-31002A';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C1500-BW',
      full_description = 'HRSG #11 BFP B HP Discharge MOV, MOV (GATE), DN 150, A216-WCC, 1500#, BW'
  WHERE tag = 'B2-MOV-31002B';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C1500-SW',
      full_description = 'BYPASS MOV FOR HRSG #11 BFP A HP Discharge MOV, MOV (GLOBE), DN 25, A105, 1500#, SW'
  WHERE tag = 'B2-MOV-31003A';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C1500-SW',
      full_description = 'BYPASS MOV FOR HRSG #11 BFP B HP Discharge MOV, MOV (GLOBE), DN 25, A105, 1500#, SW'
  WHERE tag = 'B2-MOV-31003B';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D140-C150-RF',
      full_description = 'Each CCWP Outlet Line MOV, MOV (Butterfly Valve), DN 350, A216 WCB, 150LB, RF'
  WHERE tag = 'B2-MOV-32001';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D140-C150-RF',
      full_description = 'Each CCWP Outlet Line MOV, MOV (Butterfly Valve), DN 350, A216 WCB, 150LB, RF'
  WHERE tag = 'B2-MOV-32002';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D140-C150-RF',
      full_description = 'Each CCWP Outlet Line MOV, MOV (Butterfly Valve), DN 350, A216 WCB, 150LB, RF'
  WHERE tag = 'B2-MOV-32003';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D200-C150-RF',
      full_description = 'Each CCW FFC Bypass Line MOV, MOV (Butterfly Valve), DN 500, A216 WCB, 150LB, RF'
  WHERE tag = 'B2-MOV-32004';

UPDATE material.receiving
  SET mat_code = 'MOV-SS04-D010-C600-SW',
      full_description = 'Closed Cooling Water Head Tank Make-up Line, MOV (GLOBE), DN 25, A182-F304, 600#, SW'
  WHERE tag = 'B2-MOV-32005';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D020-C600-SW',
      full_description = 'Drain Quenching water MOV, MOV (GLOBE), DN 50, A105, 600#, SW'
  WHERE tag = 'B2-MOV-33001';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-BW',
      full_description = 'HOT WATER SUPPLY PUMP DISCHARGE MOV, MOV (GLOBE), DN 150, A216-WCB, 150#, BW'
  WHERE tag = 'B2-MOV-34001';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-BW',
      full_description = 'HOT WATER SUPPLY PUMP DISCHARGE MOV, MOV (GLOBE), DN 150, A216-WCB, 150#, BW'
  WHERE tag = 'B2-MOV-34002';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-BW',
      full_description = 'HOT WATER SUPPLY PUMP DISCHARGE MOV, MOV (GLOBE), DN 150, A216-WCB, 150#, BW'
  WHERE tag = 'B2-MOV-34003';

UPDATE material.receiving
  SET mat_code = 'MOV-SS04-D010-C600-SW',
      full_description = 'HOT WATER HEAD TANK MAKE UP LINE MOV, MOV (GLOBE), DN 25, A182-F304, 600#, SW'
  WHERE tag = 'B2-MOV-34004';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-BW',
      full_description = 'HOT WATER HEATER TUBE SIDE INLET MOV, MOV (GATE), DN 150, A216-WCB, 150#, BW'
  WHERE tag = 'B2-MOV-34005';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D100-C300-BW',
      full_description = 'HOT WATER HEATER SHELL SIDE INLET MOV, MOV (GATE), DN 250, A216-WCB, 300#, BW'
  WHERE tag = 'B2-MOV-34006';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'HOT WATER HEATER SHELL SIDE VENT LINE BYPASS MOV, MOV (GLOBE), DN 25, A105, 600#, SW'
  WHERE tag = 'B2-MOV-34007';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-BW',
      full_description = 'HOT WATER HEATER TUBE SIDE INLET MOV, MOV (GATE), DN 150, A216-WCB, 150#, BW'
  WHERE tag = 'B2-MOV-34008';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D100-C300-BW',
      full_description = 'HOT WATER HEATER SHELL SIDE INLET MOV, MOV (GATE), DN 250, A216-WCB, 300#, BW'
  WHERE tag = 'B2-MOV-34009';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D010-C600-SW',
      full_description = 'HOT WATER HEATER SHELL SIDE VENT LINE BYPASS MOV, MOV (GLOBE), DN 25, A105, 600#, SW'
  WHERE tag = 'B2-MOV-34010';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-BW',
      full_description = 'HOT WATER HEATER TUBE SIDE OUTLET MOV, MOV (GATE), DN 150, A216-WCB, 150#, BW'
  WHERE tag = 'B2-MOV-34011';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-BW',
      full_description = 'HOT WATER HEATER TUBE SIDE OUTLET MOV, MOV (GATE), DN 150, A216-WCB, 150#, BW'
  WHERE tag = 'B2-MOV-34013';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-RF',
      full_description = 'Each GT Air Preheater Supply MOV, MOV (Butterfly Valve), DN 150, A216 WCB, 150LB, RF'
  WHERE tag = 'B2-MOV-34015';

UPDATE material.receiving
  SET mat_code = 'MOV-CS05-D060-C150-RF',
      full_description = 'Each GT Air Preheater Supply MOV, MOV (Butterfly Valve), DN 150, A216 WCB, 150LB, RF'
  WHERE tag = 'B2-MOV-34017';

