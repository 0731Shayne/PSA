let unsavedChanges = false;

export function setUnsavedChanges(value: boolean) {
  unsavedChanges = value;
}

export function confirmUnsavedNavigation(): boolean {
  return !unsavedChanges || window.confirm("当前页面有尚未保存的修改，确定离开吗？");
}
