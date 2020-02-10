import { Component, OnInit, Input } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { EndpointModel } from '../../models/endpoint.model';

import { StateService } from '../../services/state.service';
import { CurrentContextModel, ContextBehaviorSubjectModel } from '../../models/current-context.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

export interface EbsPrefixes {
  name: string;
  code: string;
}

@Component({
  selector: 'app-filter-objects',
  templateUrl: './filter-objects.component.html',
  styleUrls: ['./filter-objects.component.css']
})
export class FilterObjectsComponent implements OnInit {
  
  @Input() currentEndpoint: EndpointModel;

  public currentContext: CurrentContextModel;
  private currentFilter: string;
  private unsubscribe$ = new Subject<void>();

  ebsSelectCtrl = new FormControl();
  objectFilter = new FormControl(null, { updateOn: 'blur' });
  filteredPrefixes$: Observable<EbsPrefixes[]>;

  ebsPrefixes: EbsPrefixes[] = [
    { name: 'APAC Consulting Localizations (CLA)', code: 'CLA' },
    { name: 'Activity Based Management (ABM)', code: 'ABM' },
    { name: 'Advanced Benefits (BEN)', code: 'BEN' },
    { name: 'Advanced Outbound Telephony (IEC)', code: 'IEC' },
    { name: 'Advanced Planning Foundation (RHX)', code: 'RHX' },
    { name: 'Advanced Pricing (QP)', code: 'QP' },
    { name: 'Advanced Supply Chain Planning (MSC)', code: 'MSC' },
    { name: 'Alert (ALR)', code: 'ALR' },
    { name: 'Application Implementation (AZ)', code: 'AZ' },
    { name: 'Application Object Library (FND)', code: 'FND' },
    { name: 'Application Report Generator (RG)', code: 'RG' },
    { name: 'Application Utilities (AU)', code: 'AU' },
    { name: 'Applications BIS (BIS)', code: 'BIS' },
    { name: 'Applications DBA (AD)', code: 'AD' },
    { name: 'Applications Demonstration Services (ADS)', code: 'ADS' },
    { name: 'Applications Shared Technology (SHT)', code: 'SHT' },
    { name: 'Approvals Management (AME)', code: 'AME' },
    { name: 'Asia/Pacific Localizations (JA)', code: 'JA' },
    { name: 'Asset Tracking (CSE)', code: 'CSE' },
    { name: 'Assets (OFA)', code: 'OFA' },
    { name: 'Automotive (VEA)', code: 'VEA' },
    { name: 'Automotive Integration Kit (VEH)', code: 'VEH' },
    { name: 'Balanced Scorecard (BSC)', code: 'BSC' },
    { name: 'Banking Center (FPT)', code: 'FPT' },
    { name: 'Bill Presentment & Payment (IBP)', code: 'IBP' },
    { name: 'Billing Connect (CUE)', code: 'CUE' },
    { name: 'Bills of Material (BOM)', code: 'BOM' },
    { name: 'Budgeting and Planning (PBR)', code: 'PBR' },
    { name: 'CADView-3D (DDD)', code: 'DDD' },
    { name: 'CRM Foundation (JTF)', code: 'JTF' },
    { name: 'CRM Gateway for Mobile Devices (ASG)', code: 'ASG' },
    { name: 'CRM Self Service Administration (JTS)', code: 'JTS' },
    { name: 'Call Center (CSN)', code: 'CSN' },
    { name: 'Call Center Connectors (IET)', code: 'IET' },
    { name: 'Capacity (CRP)', code: 'CRP' },
    { name: 'Capital Resource Logistics - Assets (CUA)', code: 'CUA' },
    { name: 'Capital Resource Logistics - Financials (CUF)', code: 'CUF' },
    { name: 'Capital Resource Logistics - Projects (IPA)', code: 'IPA' },
    { name: 'Cash Management (CE)', code: 'CE' },
    { name: 'Citizen Interaction Center (CUG)', code: 'CUG' },
    { name: 'Clinical Transaction Base (CTB)', code: 'CTB' },
    { name: 'Collections (IEX)', code: 'IEX' },
    { name: 'Common Modules-AK (AK)', code: 'AK' },
    { name: 'Communications Intelligence (BIN)', code: 'BIN' },
    { name: 'Complex Maintenance Repair and Overhaul (AHL)', code: 'AHL' },
    { name: 'Configurator (CZ)', code: 'CZ' },
    { name: 'Consumer Packaged Goods (CPG)', code: 'CPG' },
    { name: 'Constraint Based Optimization (MSO)', code: 'MSO' },
    { name: 'Content Manager (IBC)', code: 'IBC' },
    { name: 'Contract Commitment (IGC)', code: 'IGC' },
    { name: 'Contracts Core (OKC)', code: 'OKC' },
    { name: 'Contracts Integration (OKX)', code: 'OKX' },
    { name: 'Contracts Intelligence (OKI)', code: 'OKI' },
    { name: 'Contracts for Procurement (OKP)', code: 'OKP' },
    { name: 'Contracts for Rights (OKR)', code: 'OKR' },
    { name: 'Contracts for Sales (OKO)', code: 'OKO' },
    { name: 'Contracts for Subscriptions (OKB)', code: 'OKB' },
    { name: 'Controlled Availability Product (ME)', code: 'ME' },
    { name: 'Cost Management (CST)', code: 'CST' },
    { name: 'Culinary Application (CLR)', code: 'CLR' },
    { name: 'Custom Development (CUSTOM)', code: 'CUSTOM' },
    { name: 'Customer Care (CSC)', code: 'CSC' },
    { name: 'Customer Intelligence(Obsolete) (BIC)', code: 'BIC' },
    { name: 'Customers Online (IMC)', code: 'IMC' },
    { name: 'Data Query (ODQ)', code: 'ODQ' },
    { name: 'DateTrack (DT)', code: 'DT' },
    { name: 'Demand Planning (MSD)', code: 'MSD' },
    { name: 'Demand Signal Repository (DDR)', code: 'DDR' },
    { name: 'Demo Order Entry (AOL Class) (DEM)', code: 'DEM' },
    { name: 'Depot Repair (CSD)', code: 'CSD' },
    { name: 'Development (DNA)', code: 'DNA' },
    { name: 'Digital Asset Management (IAM)', code: 'IAM' },
    { name: 'Document Managment and Collaboration (DOM)', code: 'DOM' },
    { name: 'e-Commerce Gateway (EC)', code: 'EC' },
    { name: 'eCommerce Intelligence (BIE)', code: 'BIE' },
    { name: 'E-Business Tax (ZX)', code: 'ZX' },
    { name: 'E-Records (EDR)', code: 'EDR' },
    { name: 'EMEA Add-on Localizations (CLE)', code: 'CLE' },
    { name: 'Email Center (IEM)', code: 'IEM' },
    { name: 'Engineering (ENG)', code: 'ENG' },
    { name: 'Enterprise Asset Management (EAM)', code: 'EAM' },
    { name: 'Enterprise Performance Foundation (FEM)', code: 'FEM' },
    { name: 'Enterprise Planning and Budgeting (ZPB)', code: 'ZPB' },
    { name: 'Environment Management System (EMS)', code: 'EMS' },
    { name: 'European Localizations (JE)', code: 'JE' },
    { name: 'Exchange (POM)', code: 'POM' },
    { name: 'FastFormula (FF)', code: 'FF' },
    { name: 'Federal Financials (FV)', code: 'FV' },
    { name: 'Field Service (CSF)', code: 'CSF' },
    { name: 'Field Service/Laptop (CSL)', code: 'CSL' },
    { name: 'Field Service/Palm (CSM)', code: 'CSM' },
    { name: 'Financial Aid (IGF)', code: 'IGF' },
    { name: 'Financial Analyzer (ZFA)', code: 'ZFA' },
    { name: 'Financial Consolidation Hub (GCS)', code: 'GCS' },
    { name: 'Financial Intelligence (FII)', code: 'FII' },
    { name: 'Financials Common Modules (FUN)', code: 'FUN' },
    { name: 'Flow Manufacturing (FLM)', code: 'FLM' },
    { name: 'Fulfillment Services (AMF)', code: 'AMF' },
    { name: 'Genealogy Intelligence (GNI)', code: 'GNI' },
    { name: 'General Ledger (GL)', code: 'GL' },
    { name: 'Global Accounting Engine (AX)', code: 'AX' },
    { name: 'Grants Accounting (GMS)', code: 'GMS' },
    { name: 'Grants Proposal (IGW)', code: 'IGW' },
    { name: 'Healthcare (HCA)', code: 'HCA' },
    { name: 'Healthcare Intelligence (HCP)', code: 'HCP' },
    { name: 'Healthcare Terminology Server (HCT)', code: 'HCT' },
    { name: 'Hosting Manager(Obsolete) (AHM)', code: 'AHM' },
    { name: 'Human Resources (PER)', code: 'PER' },
    { name: 'Human Resources Intelligence (HRI)', code: 'HRI' },
    { name: 'iAssets (IA)', code: 'IA' },
    { name: 'iAuction (IBT)', code: 'IBT' },
    { name: 'iClaims (OZS)', code: 'OZS' },
    { name: 'iHCConnect (HCC)', code: 'HCC' },
    { name: 'iHCIntegrate (HCN)', code: 'HCN' },
    { name: 'iMarketing (IBA)', code: 'IBA' },
    { name: 'iMeeting (IMT)', code: 'IMT' },
    { name: 'iRecruitment (IRC)', code: 'IRC' },
    { name: 'iSettlement (ISX)', code: 'ISX' },
    { name: 'iStore (IBE)', code: 'IBE' },
    { name: 'iSupplier Portal (POS)', code: 'POS' },
    { name: 'iSupport (IBU)', code: 'IBU' },
    { name: 'IVR Integrator (IEV)', code: 'IEV' },
    { name: 'Incentive Compensation (CN)', code: 'CN' },
    { name: 'Information Technology Audit (ITA)', code: 'ITA' },
    { name: 'Install Base Intelligence (XNI)', code: 'XNI' },
    { name: 'Installed Base (CSI)', code: 'CSI' },
    { name: 'Interaction Blending (IEB)', code: 'IEB' },
    { name: 'Interaction Center Intelligence (BIX)', code: 'BIX' },
    { name: 'Interaction Center Technology (IEO)', code: 'IEO' },
    { name: 'Internal Controls Manager (AMW)', code: 'AMW' },
    { name: 'Internet Procurement Enterprise Connector (ITG)', code: 'ITG' },
    { name: 'Inventory (INV)', code: 'INV' },
    { name: 'Inventory Optimization (MSR)', code: 'MSR' },
    { name: 'Japan Consulting Localizations (CLJ)', code: 'CLJ' },
    { name: 'LAD Consulting Localizations (CLL)', code: 'CLL' },
    { name: 'Labor Distribution (PSP)', code: 'PSP' },
    { name: 'Latin America Localizations (JL)', code: 'JL' },
    { name: 'Learning Management (OTA)', code: 'OTA' },
    { name: 'Lease and Finance Management (OKL)', code: 'OKL' },
    { name: 'Legal Entity Configurator (XLE)', code: 'XLE' },
    { name: 'Loans (LNS)', code: 'LNS' },
    { name: 'Manufacturing (MFG)', code: 'MFG' },
    { name: 'Manufacturing Execution System for Process Manufacturing (GMO)', code: 'GMO' },
    { name: 'Manufacturing Mobile Applications (WMA)', code: 'WMA' },
    { name: 'Manufacturing Scheduling (WPS)', code: 'WPS' },
    { name: 'Marketing (AMS)', code: 'AMS' },
    { name: 'Marketing Encyclopedia System (AMV)', code: 'AMV' },
    { name: 'Marketing Intelligence(Obsolete) (BIM)', code: 'BIM' },
    { name: 'Marketing for Communications (XNM)', code: 'XNM' },
    { name: 'Mass Market Receivables for Comms (CUR)', code: 'CUR' },
    { name: 'Master Scheduling/MRP (MRP)', code: 'MRP' },
    { name: 'Media Interactive (MIV)', code: 'MIV' },
    { name: 'Mobile Application Foundation (JTM)', code: 'JTM' },
    { name: 'Mobile Applications (MWA)', code: 'MWA' },
    { name: 'Mobile Applications for Inventory Management (MIA)', code: 'MIA' },
    { name: 'Mobile Quality Applications (MQA)', code: 'MQA' },
    { name: 'Network Logistics (CUS)', code: 'CUS' },
    { name: 'Network Logistics - Inventory (CUI)', code: 'CUI' },
    { name: 'Network Logistics - NATS (CUN)', code: 'CUN' },
    { name: 'Network Logistics - Purchasing (CUP)', code: 'CUP' },
    { name: 'Number Portability (XNP)', code: 'XNP' },
    { name: 'Obsolete Process Operations (DUMMY_GMO)', code: 'DUMMY_GMO' },
    { name: 'Operations Intelligence (OPI)', code: 'OPI' },
    { name: 'Oracle Applications Manager (OAM)', code: 'OAM' },
    { name: 'Oracle Clinical Data Repository (CDR)', code: 'CDR' },
    { name: 'Oracle Deal Management (QPR)', code: 'QPR' },
    { name: 'Oracle E-Business Suite Diagnostics (IZU)', code: 'IZU' },
    { name: 'Oracle Environmental Accounting And Reporting (GHG)', code: 'GHG' },
    { name: 'Oracle Imaging Process Management (IPM)', code: 'IPM' },
    { name: 'Oracle In-Memory Cost Management (CMI)', code: 'CMI' },
    { name: 'Oracle Landed Cost Management (INL)', code: 'INL' },
    { name: 'Oracle Manufacturing Operations Center (MTH)', code: 'MTH' },
    { name: 'Oracle Price Protection (DPP)', code: 'DPP' },
    { name: 'Oracle Profitability Manager (PFT)', code: 'PFT' },
    { name: 'Oracle Sales for Handhelds (ASP)', code: 'ASP' },
    { name: 'Oracle Telecommunications Billing Integrator (XNB)', code: 'XNB' },
    { name: 'Oracle Web Analytics (IBW)', code: 'IBW' },
    { name: 'Oracle Yard Management (YMS)', code: 'YMS' },
    { name: 'Oracle iProcurement (ICX)', code: 'ICX' },
    { name: 'Order Capture (ASO)', code: 'ASO' },
    { name: 'Order Entry (OE)', code: 'OE' },
    { name: 'Order Management (ONT)', code: 'ONT' },
    { name: 'Outsourced Manufacturing for Discrete Industries (JMF)', code: 'JMF' },
    { name: 'Partner Management (PV)', code: 'PV' },
    { name: 'Patch Tracking System (PTX)', code: 'PTX' },
    { name: 'Payables (AP)', code: 'AP' },
    { name: 'Payments (IBY)', code: 'IBY' },
    { name: 'Payroll (PAY)', code: 'PAY' },
    { name: 'Predictive (IEP)', code: 'IEP' },
    { name: 'Process Manufacturing Financials (GMF)', code: 'GMF' },
    { name: 'Process Manufacturing Intelligence (PMI)', code: 'PMI' },
    { name: 'Process Manufacturing Inventory (GMI)', code: 'GMI' },
    { name: 'Process Manufacturing Logistics (GML)', code: 'GML' },
    { name: 'Process Manufacturing Portal (GMW)', code: 'GMW' },
    { name: 'Process Manufacturing Process Execution (GME)', code: 'GME' },
    { name: 'Process Manufacturing Process Planning (GMP)', code: 'GMP' },
    { name: 'Process Manufacturing Product Development (GMD)', code: 'GMD' },
    { name: 'Process Manufacturing Regulatory Management (GR)', code: 'GR' },
    { name: 'Process Manufacturing Systems (GMA)', code: 'GMA' },
    { name: 'Product Development (IPD)', code: 'IPD' },
    { name: 'Product Hub (EGO)', code: 'EGO' },
    { name: 'Product Intelligence (ENI)', code: 'ENI' },
    { name: 'Progress Custom (PRGC)', code: 'PRGC' },
    { name: 'Project Contracts (OKE)', code: 'OKE' },
    { name: 'Project Intelligence (PJI)', code: 'PJI' },
    { name: 'Project Manufacturing (PJM)', code: 'PJM' },
    { name: 'Project Portfolio Analysis (FPA)', code: 'FPA' },
    { name: 'Projects (PA)', code: 'PA' },
    { name: 'Property Manager (PN)', code: 'PN' },
    { name: 'Proposals (PRP)', code: 'PRP' },
    { name: 'Provisioning (XDP)', code: 'XDP' },
    { name: 'Public Sector Budgeting (PSB)', code: 'PSB' },
    { name: 'Public Sector Financials (PSA)', code: 'PSA' },
    { name: 'Public Sector Financials International (IGI)', code: 'IGI' },
    { name: 'Public Sector HR (PQH)', code: 'PQH' },
    { name: 'Public Sector Payroll (PQP)', code: 'PQP' },
    { name: 'Public Sector Receivables (PSR)', code: 'PSR' },
    { name: 'Purchasing (PO)', code: 'PO' },
    { name: 'Purchasing Intelligence (POA)', code: 'POA' },
    { name: 'Quality (QA)', code: 'QA' },
    { name: 'Quoting (QOT)', code: 'QOT' },
    { name: 'Receivables (AR)', code: 'AR' },
    { name: 'Regional Localizations (JG)', code: 'JG' },
    { name: 'Regulatory Capital Manager (RCM)', code: 'RCM' },
    { name: 'Release Management (RLM)', code: 'RLM' },
    { name: 'Release Management Integration Kit (RLA)', code: 'RLA' },
    { name: 'Report Manager (FRM)', code: 'FRM' },
    { name: 'Retail Core (RRC)', code: 'RRC' },
    { name: 'Revenue Accounting (CUC)', code: 'CUC' },
    { name: 'Risk Management (QRM)', code: 'QRM' },
    { name: 'Risk Manager (RMG)', code: 'RMG' },
    { name: 'Royalty Management (OKT)', code: 'OKT' },
    { name: 'SEM Exchange (EAA)', code: 'EAA' },
    { name: 'SSP (SSP)', code: 'SSP' },
    { name: 'Sales (ASN)', code: 'ASN' },
    { name: 'Sales Analysis (AN)', code: 'AN' },
    { name: 'Sales Analyzer (ZSA)', code: 'ZSA' },
    { name: 'Sales Foundation (AS)', code: 'AS' },
    { name: 'Sales Intelligence (BIL)', code: 'BIL' },
    { name: 'Sales Offline (ASL)', code: 'ASL' },
    { name: 'Sales Online (ASF)', code: 'ASF' },
    { name: 'Sales for Communications (XNC)', code: 'XNC' },
    { name: 'Scheduler (CSR)', code: 'CSR' },
    { name: 'Scripting (IES)', code: 'IES' },
    { name: 'Service (CS)', code: 'CS' },
    { name: 'Service Assurance for Communications (XNA)', code: 'XNA' },
    { name: 'Service Contracts (OKS)', code: 'OKS' },
    { name: 'Service Intelligence (BIV)', code: 'BIV' },
    { name: 'Service for Communications (XNS)', code: 'XNS' },
    { name: 'Shipping Execution (WSH)', code: 'WSH' },
    { name: 'Shop Floor Management (WSM)', code: 'WSM' },
    { name: 'Site Management (RRS)', code: 'RRS' },
    { name: 'Sourcing (PON)', code: 'PON' },
    { name: 'Spares Management (CSP)', code: 'CSP' },
    { name: 'Student System (IGS)', code: 'IGS' },
    { name: 'Subledger Accounting (XLA)', code: 'XLA' },
    { name: 'Supplier Scheduling (CHV)', code: 'CHV' },
    { name: 'Supply Chain Intelligence (ISC)', code: 'ISC' },
    { name: 'Supply Chain Trading Connector for RosettaNet (CLN)', code: 'CLN' },
    { name: 'Support (CSS)', code: 'CSS' },
    { name: 'Systems Intelligence (BIY)', code: 'BIY' },
    { name: 'TeleBusiness for Telecom/Utilities (XNT)', code: 'XNT' },
    { name: 'TeleSales (AST)', code: 'AST' },
    { name: 'Telephony Manager (CCT)', code: 'CCT' },
    { name: 'Time and Labor (HXT)', code: 'HXT' },
    { name: 'Time and Labor Engine (HXC)', code: 'HXC' },
    { name: 'Trade Management (OZF)', code: 'OZF' },
    { name: 'Trade Planning (OZP)', code: 'OZP' },
    { name: 'Transfer Pricing (FTP)', code: 'FTP' },
    { name: 'Transportation Execution (FTE)', code: 'FTE' },
    { name: 'Transportation Planning (MST)', code: 'MST' },
    { name: 'Treasury (XTR)', code: 'XTR' },
    { name: 'US Federal Human Resources (GHR)', code: 'GHR' },
    { name: 'Universal Work Queue (IEU)', code: 'IEU' },
    { name: 'University Curriculum (OUC)', code: 'OUC' },
    { name: 'Utility Billing (BLC)', code: 'BLC' },
    { name: 'Value Based Management (EVM)', code: 'EVM' },
    { name: 'Warehouse Management (WMS)', code: 'WMS' },
    { name: 'Web Applications Desktop Integrator (BNE)', code: 'BNE' },
    { name: 'Work in Process (WIP)', code: 'WIP' },
    { name: 'XML Gateway (ECX)', code: 'ECX' },
    { name: 'XML Publisher (XDO)', code: 'XDO' }
  ];

  public setEbsFilter(productSelection){
    if (productSelection){
      const productEntry = this.ebsPrefixes.find(entry => entry.name === productSelection );    
      this.objectFilter.setValue(`${productEntry.code}_*`);
    }    
  }



  constructor(private state: StateService) { }

  private _filteredPrefixes(value: string): EbsPrefixes[] {
    const filterValue = value.toLowerCase();
    return this.ebsPrefixes.filter(ebsPrefix => ebsPrefix.name.toLowerCase().indexOf(filterValue)===0);
  }

  processContextChange(subjectContext: ContextBehaviorSubjectModel) {
    const context = subjectContext.currentContext;
    this.currentContext = context;
    if (context.filter !== this.currentFilter){
      this.objectFilter.setValue(context.filter);
      this.currentFilter = context.filter;
    }
    
  }

  ngOnInit() {
    this.state.currentContext$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(context => { this.processContextChange(context); });


    this.filteredPrefixes$ = this.ebsSelectCtrl.valueChanges
    .pipe(
      startWith(''),
      map(ebsPrefix => ebsPrefix ? this._filteredPrefixes(ebsPrefix) : this.ebsPrefixes.slice())
    );  

    this.objectFilter.valueChanges.subscribe(value => {
      if (value !== this.currentContext.filter) {
        this.currentContext.setFilter(value);
        this.state.setCurrentContext(this.currentContext);
      }
     
    });
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

}
