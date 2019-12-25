import { Component, OnInit, Input } from '@angular/core';
import { BPApi } from 'src/app/services/bpapi.service';
import { take } from 'rxjs/operators';
import { Task, ProcessParticipants, FieldProp } from './task.object';
import { iif, Observable } from 'rxjs';

@Component({
  templateUrl: 'task.component.html',
  selector: 'bp-task'
})
export class TaskComponent implements OnInit {

  @Input() Task: Task;
  @Input() ProcessID: string;

  get showProp() { return false; }


  get getProcessID() {
    return this.ProcessID === '' || this.ProcessID === undefined ? this.Task.ProcessID : this.ProcessID;
  }

  mapImgSrc = '';
  ProcessParticipants: {} = [];
  ProcessParticipantsFields: FieldProp[];
  ProcessParticipantsLoaded = false;
  _ProcessParticipants$: Observable<ProcessParticipants>;

  ngOnInit() {
    this.loadProcessParticipants();
  }

  constructor(public bpAPI: BPApi) {
  }

  loadMap() {
    this.mapImgSrc = `http://35.204.78.79/JettiProcesses/hs/Processes/pwd/GetMapByProcessID/CashApplication?ProcessID=${this.getProcessID}`;
  }

  public loadProcessParticipants() {

    this.ProcessParticipantsFields = ProcessParticipants.getFields();
    this._ProcessParticipants$ = this.bpAPI.GetParticipantsByProcessID(this.getProcessID);
    this.ProcessParticipantsLoaded = true;


    // this.bpAPI.GetParticipantsByProcessID(this.getProcessID).pipe(take(1)).subscribe(
    //   res => {
    //     this.ProcessParticipants = res;

  }

  handleTabChange(e) {
    if (e.index === 1 && this.mapImgSrc.length === 0) { this.loadMap(); }
    // if (e.index === 0 && !this.ProcessParticipantsLoaded) { this.loadProcessParticipants(); }
  }

}