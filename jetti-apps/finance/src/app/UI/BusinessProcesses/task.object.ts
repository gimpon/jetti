export interface FieldProp {
  name: string;
  label: string;
  visible: boolean;
  style: string;
  type: string;
}

export class ProcessParticipants {

  Согласующий;
  Completed;
  Роль;
  ШагСогласования;
  ДатаВыполнения;
  Комментарий;
  Решение;
  ПроцессНомер;
  ЗадачаДата;
  ЗадачаНомер;
  Current: boolean;
  КонтрольныйСрок;
  ПросроченоЧасов;

  public static getFields(): FieldProp[] {
    return [{ name: 'ШагСогласования', label: 'Шаг', visible: true, style: 'width: 2em;', type: 'number' },
    { name: 'Согласующий', label: 'Согласующий', visible: true, style: 'width: 10em;', type: 'string' },
    { name: 'Роль', label: 'Роль', visible: true, style: 'width: 10em;', type: 'string' },
    { name: 'ДатаВыполнения', label: 'Выполнена', visible: true, style: 'width: 10em;', type: 'Date' },
    { name: 'Решение', label: 'Решение', visible: true, style: 'width: 8em;', type: 'string' },
    { name: 'КонтрольныйСрок', label: 'Срок', visible: true, style: 'width: 8em;', type: 'Date' },
    { name: 'ПросроченоЧасов', label: 'Просрочено, ч', visible: true, style: 'width: 3em;', type: 'number' },
    { name: 'Комментарий', label: 'Комментарий', visible: true, style: 'width: 20em;', type: 'string' }];
  }
}

export interface Task {

  TaskName: string;
  TaskID: number;
  ProcessID: string;
  Subdivision: string;
  ItemName: string;
  Summ: number;
  AutorName: string;
  TaskDate: string;
  UserDecision: string;
  ControlDate: string;
  HoursRemaining: number;
  Completed: boolean;
  CanApprove: boolean;
  CanReject: boolean;
  CanModify: boolean;
  Comment: string;
  DecisionComment: string;
  CurrentTask: boolean;
  Detailed: boolean;
  BaseDocumentID: string;

  ProcessParticipants: {};
  ProcessParticipantsFields: string[];
  ProcessParticipantsLoaded: boolean;

}
