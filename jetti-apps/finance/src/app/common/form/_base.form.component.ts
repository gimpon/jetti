import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ChangeDetectorRef, Input, OnDestroy, OnInit, QueryList, ViewChildren } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MenuItem } from 'primeng/components/common/menuitem';
import { merge, of as observableOf, Subscription, BehaviorSubject } from 'rxjs';
import { filter, take, map } from 'rxjs/operators';
import { v1 } from 'uuid';
import { dateReviverLocal } from '../../../../../../jetti-api/server/fuctions/dateReviver';
import { calculateDescription, IViewModel } from '../../../../../../jetti-api/server/models/common-types';
import { DocumentBase, DocumentOptions, Ref, Relation, Command, CopyTo } from '../../../../../../jetti-api/server/models/document';
import { DocService } from '../doc.service';
import { FormControlInfo } from '../dynamic-form/dynamic-form-base';
import { patchOptionsNoEvents, DynamicFormService, getFormGroup } from '../dynamic-form/dynamic-form.service';
import { TabsStore } from '../tabcontroller/tabs.store';
import { AuthService } from 'src/app/auth/auth.service';
import { DocTypes } from '../../../../../../jetti-api/server/models/documents.types';
import { FormBase } from '../../../../../../jetti-api/server/models/Forms/form';

// tslint:disable-next-line: class-name
export class _baseDocFormComponent implements OnDestroy, OnInit {

  @Input() id: string;
  @Input() type: DocTypes;
  @Input() data: FormGroup;
  @ViewChildren(CdkTrapFocus) cdkTrapFocus: QueryList<CdkTrapFocus>;

  get isDoc() { return this.type.startsWith('Document.'); }
  get isForm() { return this.type.startsWith('Form.'); }
  get isCatalog() { return this.type.startsWith('Catalog.'); }

  private readonly _form$ = new BehaviorSubject<FormGroup>(undefined);
  form$ = this._form$.asObservable();

  viewModel$ = this.form$.pipe(map(f => f.getRawValue() as DocumentBase | FormBase));
  docDescription$ = this.form$.pipe(map(f => <string>f['metadata'].description));
  metadata$ = this.form$.pipe(map(f => <DocumentOptions>f['metadata']));
  relations$ = this.form$.pipe(map(f => (f && f['metadata'] && f['metadata'].relations || []) as Relation[]));
  v$ = this.form$.pipe(map(f => (<FormControlInfo[]>f['orderedControls'])));
  vk$ = this.form$.pipe(map(f => (<{ [key: string]: FormControlInfo }>f['byKeyControls'])));
  tables$ = this.form$.pipe(map(f => (<FormControlInfo[]>f['orderedControls']).filter(t => t.controlType === 'table')));
  hasTables$ = this.tables$.pipe(map(t => t.length > 0));
  description$ = this.form$.pipe(map(f => (<FormControl>f.get('description'))));
  isPosted$ = this.form$.pipe(map(f => (<boolean>!!f.get('posted').value)));
  isDeleted$ = this.form$.pipe(map(f => (<boolean>!!f.get('deleted').value)));
  isNew$ = this.form$.pipe(map(f => (!f.get('timestamp').value)));
  isFolder$ = this.form$.pipe(map(f => (!!f.get('isfolder').value)));
  commands$ = this.metadata$.pipe(map(m => {
    return (m && m['commands'] as Command[] || []).map(c => (
      <MenuItem>{
        label: c.label, icon: c.icon,
        command: () => this.commandOnSever(c.method)
      }));
  }));
  copyTo$ = this.metadata$.pipe(map(m => {
    return (m && m['copyTo'] as CopyTo[] || []).map(c => {
      const { label, icon, Operation, type } = c;
      return (<MenuItem>{ label, icon, command: () => this.baseOn(type, Operation) });
    });
  }));
  module$ = this.metadata$.pipe(map(m => {
    return (new Function('', m['clientModule'] || {}).bind(this)()) || {};
  }));

  get form() { return this._form$.value; }
  get viewModel() { return this.form.getRawValue(); }
  get metadata() { return <DocumentOptions>this.form['metadata']; }
  get docDescription() { return <string>this.metadata.description; }
  get relations() { return (this.metadata.relations || []) as Relation[]; }
  get v() { return <FormControlInfo[]>this.form['orderedControls']; }
  get vk() { return <{ [key: string]: FormControlInfo }>this.form['byKeyControls']; }
  get tables() { return (<FormControlInfo[]>this.form['orderedControls']).filter(t => t.controlType === 'table'); }
  get hasTables() { return this.tables.length > 0; }
  get description() { return <FormControl>this.form.get('description'); }
  get isPosted() { return <boolean>!!this.form.get('posted').value; }
  get isDeleted() { return <boolean>!!this.form.get('deleted').value; }
  get isNew() { return !this.form.get('timestamp').value; }
  get isFolder() { return !!this.form.get('isfolder').value; }
  get commands() {
    return (this.metadata['commands'] as Command[] || []).map(c => {
      return (<MenuItem>{
        label: c.label, icon: c.icon,
        command: () => this.commandOnSever(c.method)
      });
    });
  }
  get copyTo() {
    return (this.metadata['copyTo'] as CopyTo[] || []).map(c => {
      return (<MenuItem>{ label: c.label, icon: c.icon, command: (event) => this.baseOn(c.type, c.Operation) });
    });
  }
  get module() { return new Function('', this.metadata['clientModule'] || {}).bind(this)() || {}; }
  get settings() {
    return this.relations.map(r => ({
      order: [], filter: [
        { left: r.field, center: '=', right: { id: this.viewModel.id, type: this.viewModel.type, value: this.viewModel.description } }]
    }));
  }

  private _subscription$: Subscription = Subscription.EMPTY;
  private _formSubscription$: Subscription = Subscription.EMPTY;
  private _descriptionSubscription$: Subscription = Subscription.EMPTY;
  private _saveCloseSubscription$: Subscription = Subscription.EMPTY;
  private _postSubscription$: Subscription = Subscription.EMPTY;
  private _uuid = this.route.snapshot.queryParams.uuid;

  isCopy: boolean;

  constructor(
    public router: Router, public route: ActivatedRoute, public auth: AuthService,
    public ds: DocService, public tabStore: TabsStore, public dss: DynamicFormService,
    public cd: ChangeDetectorRef) { }

  refresh() {
    this.dss.getViewModel$(this.type, this.viewModel.id).pipe(take(1)).subscribe(formGroup => {
      this.Next(formGroup);
    });
  }

  private Next(formGroup: FormGroup) {
    const orderedControls = [...formGroup['orderedControls']];
    const byKeyControls = { ...formGroup['byKeyControls'] };
    formGroup['orderedControls'] = [];
    formGroup['byKeyControls'] = {};
    this._form$.next(formGroup);
    this.cd.markForCheck();
    setTimeout(() => {
      formGroup['orderedControls'] = orderedControls;
      formGroup['byKeyControls'] = byKeyControls;
      this._form$.next(formGroup);
      setTimeout(() => this.cd.detectChanges());
    });
  }

  showDescription() {
    if (this.isDoc) {
      const date = this.form.get('date')!.value;
      const code = this.form.get('code')!.value;
      const group = this.form.get('Group') && this.form.get('Group')!.value ? this.form.get('Group')!.value.value : '';
      const value = calculateDescription(this._form$.value['metadata'].description,
        JSON.parse(JSON.stringify(date), dateReviverLocal), code, group);
      this.description.patchValue(value, patchOptionsNoEvents);
    }
  }

  save() { this.showDescription(); this.ds.save(this.viewModel as DocumentBase); }
  delete() { this.ds.delete(this.viewModel.id); }
  post() { const doc = this.viewModel; this.ds.post(doc as DocumentBase); }
  unPost() { this.ds.unpost(this.viewModel as DocumentBase); }
  postClose() { const doc = this.viewModel; this.ds.post(doc as DocumentBase, true); }
  copy() {
    return this.router.navigate(
      [this.viewModel.type, v1().toUpperCase()], { queryParams: { copy: this.id } });
  }

  goto() {
    return this.router.navigate([this.viewModel.type],
      { queryParams: { goto: this.id, posted: this.viewModel.posted }, replaceUrl: true });
  }

  private _close() {
    const tab = this.tabStore.state.tabs.find(t => t.docID === this.id && t.docType === this.type);
    if (tab) {
      this.tabStore.close(tab);
      const parentTab = this.tabStore.state.tabs.find(t => t.docType === this.type && !t.docID);
      if (parentTab) {
        this.router.navigate([parentTab.docType, parentTab.docID], { queryParams: parentTab.query });
      } else {
        const returnTab = this.tabStore.state.tabs[this.tabStore.selectedIndex];
        this.router.navigate([returnTab.docType, returnTab.docID], { queryParams: returnTab.query });
      }
    }
  }

  close() {
    if (this.form.pristine) { this._close(); return; }
    this.ds.confirmationService.confirm({
      header: 'Discard changes and close?',
      message: this.description.value || this.docDescription,
      icon: 'fa fa-question-circle',
      accept: this._close.bind(this),
      reject: this.focus.bind(this),
      key: this.id
    });
    this.cd.detectChanges();
  }

  focus() {
    const autoCapture = this.cdkTrapFocus.find(el => el.autoCapture);
    if (autoCapture) autoCapture.focusTrap.focusFirstTabbableElementWhenReady();
  }

  print() {
    throw new Error('Print not implemented!');
  }

  baseOn(type: DocTypes, Operation: Ref) {
    console.log(type, Operation);
    this.router.navigate([type, v1()],
      { queryParams: { base: this.id, Operation } });
  }

  commandOnSever(method: string) {
    this.ds.api.onCommand(this.viewModel, method, {}).then((value: IViewModel) => {
      const form = getFormGroup(value.schema, value.model, true);
      form['metadata'] = value.metadata;
      this.Next(form);
      this.form.markAsDirty();
    });
  }

  commandOnClient(method: string) {
    this.module[method](this.viewModel).then(value => {
      this.form.patchValue(value || {}, patchOptionsNoEvents);
      this.form.markAsDirty();
    });
  }

  startWorkFlow() {
    this.ds.startWorkFlow(this.id).then(doc => {
      this.form.patchValue({ workflow: { id: doc.id, type: doc.type, code: doc.code, value: doc.description } });
      this.save();
      this.router.navigate([doc.type, doc.id]);
    });
  }

  ngOnInit() {
    this.isCopy = this.route.snapshot.queryParams.command === 'copy';

    this._subscription$ = merge(...[this.ds.save$, this.ds.delete$, this.ds.post$, this.ds.unpost$]).pipe(
      filter(doc => doc.id === this.id))
      .subscribe(doc => {
        this.form.patchValue(doc, patchOptionsNoEvents);
        if (this.isDoc) { this.showDescription(); }
        this.form.markAsPristine();
      });

    this._saveCloseSubscription$ = this.ds.saveClose$.pipe(
      filter(doc => doc.id === this.id))
      .subscribe(doc => {
        this.form.markAsPristine();
        this.close();
      });

    setTimeout(() => {
      this._descriptionSubscription$ = merge(...[
        this.form.get('date')!.valueChanges,
        this.form.get('code')!.valueChanges,
        this.form.get('Group') ? this.form.get('Group')!.valueChanges : observableOf('')])
        .pipe(filter(_ => this.isDoc)).subscribe(_ => this.showDescription());
    });

    this._form$.next(this.data);
    this._formSubscription$ = this.ds.form$.pipe(filter(f => f.value.id === this.id)).subscribe(form => {
      this.Next(form);
    });
  }

  ngOnDestroy() {
    this._subscription$.unsubscribe();
    this._formSubscription$.unsubscribe();
    this._descriptionSubscription$.unsubscribe();
    this._saveCloseSubscription$.unsubscribe();
    this._postSubscription$.unsubscribe();
    this.ds.showDialog(this._uuid, this.form.getRawValue() as DocumentBase);
  }
}